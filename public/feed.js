document.addEventListener('DOMContentLoaded', async () => {
    // Auth Check
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    const feedContainer = document.getElementById('feedContainer');
    const logoutNav = document.getElementById('logoutNav');

    if (logoutNav) {
        logoutNav.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('token');
            window.location.href = 'login.html';
        });
    }

    // Load Feed
    try {
        const response = await fetch('/api/videos');
        const videos = await response.json();

        if (videos.length === 0) {
            feedContainer.innerHTML = '<div style="color:white; text-align:center; padding-top:20vh;">No videos yet! Go upload one.</div>';
            return;
        }

        videos.forEach(video => {
            const card = createVideoCard(video);
            feedContainer.appendChild(card);
        });

        // Auto-play observer
        setupVideoObserver();

    } catch (error) {
        console.error("Failed to load feed", error);
    }

    function createVideoCard(video) {
        const div = document.createElement('div');
        div.className = 'video-card';

        // Likes count logic
        const likesCount = video.likes ? video.likes.length : 0;
        const isLiked = video.likes && video.likes.includes(parseJwt(token).id); // Only works if we decode JWT, but simple check for now: relies on server response for toggle
        // To be strictly correct, we'd need to fetch "isLiked" state or decode token ID locally.
        // Let's assume server returns full objects for now.

        div.innerHTML = `
            <video class="video-player" src="${video.blobUrl}" loop playsinline></video>
            <div class="overlay">
                <div class="overlay-content">
                    <div class="video-info">
                        <h3>@${video.createdBy || 'user'}</h3>
                        <p>${video.title}</p>
                        <p style="font-size: 0.8rem;">${video.description || ''}</p>
                    </div>
                    <div class="actions">
                        <button class="action-btn like-btn" data-id="${video.id}">
                            <ion-icon name="${isLiked ? 'heart' : 'heart-outline'}" class="${isLiked ? 'liked' : ''}"></ion-icon>
                            <span class="likes-count">${likesCount}</span>
                        </button>
                        <button class="action-btn comment-btn" data-id="${video.id}">
                            <ion-icon name="chatbubble-ellipses-outline"></ion-icon>
                            <span>${video.comments ? video.comments.length : 0}</span>
                        </button>
                        <button class="action-btn share-btn">
                            <ion-icon name="share-social-outline"></ion-icon>
                            <span>Share</span>
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Video Play/Pause on click
        const videoEl = div.querySelector('video');
        div.addEventListener('click', (e) => {
            if (e.target.closest('button')) return; // Ignore button clicks
            if (videoEl.paused) videoEl.play();
            else videoEl.pause();
        });

        // Like Action
        const likeBtn = div.querySelector('.like-btn');
        likeBtn.addEventListener('click', async () => {
            // Optimistic Update
            const icon = likeBtn.querySelector('ion-icon');
            const countSpan = likeBtn.querySelector('.likes-count');
            let currentLikse = parseInt(countSpan.textContent);

            if (icon.name === 'heart-outline') {
                icon.name = 'heart';
                icon.classList.add('liked');
                countSpan.textContent = currentLikse + 1;
            } else {
                icon.name = 'heart-outline';
                icon.classList.remove('liked');
                countSpan.textContent = Math.max(0, currentLikse - 1);
            }

            try {
                const res = await fetch(`/api/videos/${video.id}/like`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                countSpan.textContent = data.likes;
                if (data.liked) {
                    icon.name = 'heart';
                    icon.classList.add('liked');
                } else {
                    icon.name = 'heart-outline';
                    icon.classList.remove('liked');
                }
            } catch (err) {
                console.error("Like failed", err);
            }
        });

        // Share Action
        const shareBtn = div.querySelector('.share-btn');
        shareBtn.addEventListener('click', () => {
            if (navigator.share) {
                navigator.share({
                    title: video.title,
                    text: video.description,
                    url: window.location.href // Ideally deep link to video
                });
            } else {
                alert("Link copied to clipboard!");
                navigator.clipboard.writeText(video.blobUrl);
            }
        });

        return div;
    }

    function setupVideoObserver() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const video = entry.target.querySelector('video');
                if (entry.isIntersecting) {
                    video.play().catch(e => console.log("Autoplay prevented"));
                } else {
                    video.pause();
                    video.currentTime = 0; // Reset
                }
            });
        }, { threshold: 0.6 });

        document.querySelectorAll('.video-card').forEach(card => observer.observe(card));
    }

    // Helper to decode JWT for user ID (simple version)
    function parseJwt(token) {
        var base64Url = token.split('.')[1];
        var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        var jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function (c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    }
});
