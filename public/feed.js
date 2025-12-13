document.addEventListener('DOMContentLoaded', async () => {
    let isGlobalMuted = true; // Global Audio State

    // Auth Check (Optional for Feed now)
    const token = localStorage.getItem('token');
    // REMOVED restricted access check

    const feedContainer = document.getElementById('feedContainer');
    const logoutNav = document.getElementById('logoutNav');

    // Update Nav based on Auth State
    if (logoutNav) {
        if (token) {
            logoutNav.addEventListener('click', (e) => {
                e.preventDefault();
                localStorage.removeItem('token');
                window.location.href = 'login.html';
            });
        } else {
            // Change Logout icon to Login for guests
            logoutNav.innerHTML = '<ion-icon name="log-in-outline"></ion-icon>';
            logoutNav.href = 'login.html';
        }
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
        let isLiked = false;
        if (token && video.likes) {
            try {
                const userId = parseJwt(token).id;
                isLiked = video.likes.includes(userId);
            } catch (e) { console.error("Invalid token"); }
        }
        // To be strictly correct, we'd need to fetch "isLiked" state or decode token ID locally.
        // Let's assume server returns full objects for now.

        // Check ownership
        let isOwner = false;
        let currentUsername = null;
        if (token) {
            try {
                const decoded = parseJwt(token);
                currentUsername = decoded.username; // Assuming username is in JWT
                // Note: video.createdBy should be username to match req.user.username in backend check
                // If createdBy is username, this works.
                if (video.createdBy === currentUsername) {
                    isOwner = true;
                }
            } catch (e) { }
        }

        const optionsButtonHTML = isOwner ? `
            <div class="options-menu-container" style="position: relative;">
                <button class="action-btn options-btn">
                    <ion-icon name="ellipsis-horizontal"></ion-icon>
                    <span>More</span>
                </button>
                <div class="options-dropdown">
                    <button class="option-item edit-option">
                        <ion-icon name="create-outline"></ion-icon> Edit
                    </button>
                    <button class="option-item delete-option delete-item">
                        <ion-icon name="trash-outline"></ion-icon> Delete
                    </button>
                </div>
            </div>
        ` : '';

        div.innerHTML = `
            <div class="video-frame">
                <video class="video-player" src="${video.blobUrl}" loop playsinline muted></video>
                
                <div class="overlay">
                    <div class="overlay-content">
                        <div class="video-info">
                            <h3>@${video.createdBy || 'anonymous'}</h3>
                            <p class="video-title">${video.title}</p>
                            <p class="video-desc" style="font-size: 0.8rem;">${video.description || ''}</p>
                        </div>
                    </div>
                </div>

                <div class="actions">
                    <button class="action-btn mute-btn" style="margin-bottom: auto">
                        <ion-icon name="volume-mute-outline"></ion-icon>
                        <span>Mute</span>
                    </button>
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
                    ${optionsButtonHTML}
                </div>
            </div>
        `;

        // Video Play/Pause on click
        const videoEl = div.querySelector('video');
        videoEl.muted = isGlobalMuted; // Initialize with global state

        // Mute Toggle
        const muteBtn = div.querySelector('.mute-btn');
        const muteIcon = muteBtn.querySelector('ion-icon');
        const muteText = muteBtn.querySelector('span'); // Get span

        // Sync UI initial state
        muteIcon.name = isGlobalMuted ? 'volume-mute-outline' : 'volume-high-outline';
        muteText.textContent = isGlobalMuted ? "Mute" : "Vol";

        muteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isGlobalMuted = !isGlobalMuted; // Toggle global state

            // Update ALL videos and buttons
            document.querySelectorAll('.video-card').forEach(card => {
                const vid = card.querySelector('video');
                const btn = card.querySelector('.mute-btn');
                const icon = btn.querySelector('ion-icon');
                const text = btn.querySelector('span');

                if (vid) vid.muted = isGlobalMuted;
                if (icon) icon.name = isGlobalMuted ? 'volume-mute-outline' : 'volume-high-outline';
                if (text) text.textContent = isGlobalMuted ? "Mute" : "Vol";
            });
        });

        // Error Handling: Remove card if video fails to load (orphaned metadata)
        videoEl.addEventListener('error', () => {
            console.warn(`Removing orphaned video: ${video.id}`);
            div.remove();
        });

        div.addEventListener('click', (e) => {
            if (e.target.closest('button')) return; // Ignore button clicks
            // Close dropdown if clicked outside
            const dropdowns = document.querySelectorAll('.options-dropdown.show');
            dropdowns.forEach(d => d.classList.remove('show'));

            if (videoEl.paused) videoEl.play();
            else videoEl.pause();
        });

        // Options Menu Logic
        if (isOwner) {
            const optionsBtn = div.querySelector('.options-btn');
            const dropdown = div.querySelector('.options-dropdown');
            const editBtn = div.querySelector('.edit-option');
            const deleteBtn = div.querySelector('.delete-option');

            optionsBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent video toggle
                dropdown.classList.toggle('show');
            });

            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm("Are you sure you want to delete this video?")) {
                    try {
                        const res = await fetch(`/api/videos/${video.id}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (res.ok) {
                            div.remove(); // Remove from DOM
                        } else {
                            alert("Failed to delete video");
                        }
                    } catch (err) { console.error(err); }
                }
            });

            editBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const newTitle = prompt("Enter new title:", video.title);
                if (newTitle !== null) {
                    const newDesc = prompt("Enter new description:", video.description);
                    if (newDesc !== null) {
                        try {
                            const res = await fetch(`/api/videos/${video.id}`, {
                                method: 'PUT',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${token}`
                                },
                                body: JSON.stringify({ title: newTitle, description: newDesc })
                            });
                            if (res.ok) {
                                // Update UI locally
                                div.querySelector('.video-info p').textContent = newTitle; // Warning: selector might be ambiguous if description is also p
                                // Make selectors more specific in innerHTML above
                                div.querySelector('.video-title').textContent = newTitle;
                                div.querySelector('.video-desc').textContent = newDesc;
                                dropdown.classList.remove('show');
                            } else {
                                alert("Failed to update video");
                            }
                        } catch (err) { console.error(err); }
                    }
                }
            });
        }


        // Like Action
        const likeBtn = div.querySelector('.like-btn');
        likeBtn.addEventListener('click', async () => {
            if (!token) {
                alert("Please login to like videos!");
                window.location.href = 'login.html';
                return;
            }

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
                    video.play().catch(e => { /* Autoplay prevented - expected if no user interaction yet */ });
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
