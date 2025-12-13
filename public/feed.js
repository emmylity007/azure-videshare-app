document.addEventListener('DOMContentLoaded', async () => {
    let isGlobalMuted = true; // Global Audio State

    // Auth Check (Optional for Feed now)
    const token = localStorage.getItem('token');
    // REMOVED restricted access check

    const feedContainer = document.getElementById('feedContainer');
    const logoutNav = document.getElementById('logoutNav');
    const userProfile = document.getElementById('userProfile');

    // Display User Profile if logged in
    if (token && userProfile) {
        try {
            const decoded = parseJwt(token);
            const username = decoded.username || 'User';
            const initial = username.charAt(0).toUpperCase();

            userProfile.innerHTML = `
                <div class="profile-avatar" style="cursor: pointer;">${initial}</div>
                <div class="profile-text" style="cursor: pointer;">
                    <span class="welcome-label">Welcome back,</span>
                    <span class="username-label">@${username}</span>
                </div>
                
                <!-- Profile Dropdown -->
                <div class="profile-dropdown">
                    <div class="dropdown-item">
                        <ion-icon name="person-outline"></ion-icon> Profile
                    </div>
                    <div class="dropdown-item">
                        <ion-icon name="settings-outline"></ion-icon> Settings
                    </div>
                    <div class="dropdown-item logout-item" id="logoutBtn">
                        <ion-icon name="log-out-outline"></ion-icon> Sign Out
                    </div>
                </div>
            `;

            // Toggle Dropdown
            userProfile.addEventListener('click', (e) => {
                e.preventDefault();
                userProfile.classList.toggle('active');
            });

            // Logout Logic
            setTimeout(() => {
                const logoutBtn = document.getElementById('logoutBtn');
                if (logoutBtn) {
                    logoutBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        localStorage.removeItem('token');
                        window.location.href = 'index.html';
                    });
                }
            }, 0);

        } catch (e) {
            console.error("Profile load error", e);
        }
    }

    // Update Nav based on Auth State (Simplified - Logout removed from nav)
    if (logoutNav) {
        if (!token) {
            // Only handle login link for guests
            logoutNav.innerHTML = '<ion-icon name="log-in-outline"></ion-icon>';
            logoutNav.href = 'login.html';
        } else {
            // If logged in, remove the logout button from NAV entirely
            logoutNav.parentElement.remove(); // Removes the .nav-bottom container containing it? 
            // Or just hide it. Let's hide it to be safe.
            logoutNav.style.display = 'none';
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

        // Check ownership
        let isOwner = false;
        let currentUsername = null;
        if (token) {
            try {
                const decoded = parseJwt(token);
                currentUsername = decoded.username;
                if (video.createdBy === currentUsername) {
                    isOwner = true;
                }
            } catch (e) { }
        }

        let optionsItems = '';

        // Added: Only logged in users can Save
        if (token) {
            optionsItems += `
                <button class="option-item download-option">
                    <ion-icon name="download-outline"></ion-icon> Save
                </button>
            `;
        }

        if (isOwner) {
            optionsItems += `
                <button class="option-item edit-option">
                    <ion-icon name="create-outline"></ion-icon> Edit
                </button>
                <button class="option-item delete-option delete-item">
                    <ion-icon name="trash-outline"></ion-icon> Delete
                </button>
            `;
        }

        const optionsButtonHTML = optionsItems ? `
            <div class="options-menu-container" style="position: relative;">
                <button class="action-btn options-btn">
                    <ion-icon name="ellipsis-horizontal"></ion-icon>
                    <span>More</span>
                </button>
                <div class="options-dropdown">
                    ${optionsItems}
                </div>
            </div>
        ` : '';

        div.innerHTML = `
            <div class="video-frame">
                <video class="video-player" src="${video.blobUrl}" loop playsinline></video>
                
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

                <div class="comments-panel">
                    <div class="panel-header">
                        <h3>Comments (<span class="comment-count-header">${video.comments ? video.comments.length : 0}</span>)</h3>
                        <button class="close-comments"><ion-icon name="close-outline"></ion-icon></button>
                    </div>
                    <div class="comments-list">
                         ${video.comments && video.comments.length > 0 ?
                video.comments.map(c => `
                                 <div class="comment-item">
                                     <strong>${c.username || 'User'}</strong>
                                     <p>${c.text}</p>
                                 </div>
                             `).join('') : '<p class="no-comments">No comments yet.</p>'
            }
                    </div>
                    <div class="comment-input-area">
                        <input type="text" placeholder="Add a comment..." class="comment-input">
                        <button class="post-comment-btn"><ion-icon name="send"></ion-icon></button>
                    </div>
                </div>
            </div>
        `;

        // Video Play/Pause setup
        const videoEl = div.querySelector('video');
        videoEl.muted = isGlobalMuted; // Initialize with global state
        videoEl.volume = 1.0;
        // Ensure no captions/tracks
        videoEl.disableRemotePlayback = true;

        // -- Comments Logic --
        const commentBtn = div.querySelector('.comment-btn');
        const commentsPanel = div.querySelector('.comments-panel');
        const closeCommentsBtn = div.querySelector('.close-comments');
        const postCommentBtn = div.querySelector('.post-comment-btn');
        const commentInput = div.querySelector('.comment-input');
        const commentsList = div.querySelector('.comments-list');
        const commentCountSpan = div.querySelector('.comment-btn span');
        const headerCountSpan = div.querySelector('.comment-count-header');

        const toggleComments = (e) => {
            if (e) e.stopPropagation();
            commentsPanel.classList.toggle('open');
        };

        commentBtn.addEventListener('click', toggleComments);
        closeCommentsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            commentsPanel.classList.remove('open');
        });

        // Prevent click inside panel from closing or pausing video
        commentsPanel.addEventListener('click', (e) => e.stopPropagation());

        // TAP TO MUTE LOGIC (Replaces Play/Pause and Mute Button)
        const videoFrame = div.querySelector('.video-frame');

        videoFrame.addEventListener('click', (e) => {
            // Ignore if clicking buttons/panels
            if (e.target.closest('button') || e.target.closest('.comments-panel') || e.target.closest('.options-menu-container')) return;

            e.preventDefault();
            e.stopPropagation();

            // Toggle Global Mute State
            isGlobalMuted = !isGlobalMuted;

            // Apply to ALL videos to keep sync
            document.querySelectorAll('video').forEach(vid => {
                vid.muted = isGlobalMuted;
                if (!isGlobalMuted) {
                    vid.removeAttribute('muted'); // Ensure unmuted works
                }
            });

            // Wake up Audio Engine if unmuting
            if (!isGlobalMuted) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (AudioContext) {
                    const ctx = new AudioContext();
                    ctx.resume().then(() => ctx.close());
                }
            }
        });


        // Video Play/Pause on click




        // Post Comment
        const postComment = async () => {
            if (!token) {
                alert("Please login to comment");
                window.location.href = 'login.html';
                return;
            }
            const text = commentInput.value.trim();
            if (!text) return;

            try {
                const res = await fetch(`/api/videos/${video.id}/comment`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ text })
                });

                if (res.ok) {
                    const newComment = await res.json();

                    // Remove 'no comments' msg if exists
                    const noComments = commentsList.querySelector('.no-comments');
                    if (noComments) noComments.remove();

                    // Append new comment
                    const commentDiv = document.createElement('div');
                    commentDiv.className = 'comment-item';
                    commentDiv.innerHTML = `<strong>${newComment.username || 'Me'}</strong><p>${newComment.text}</p>`;
                    commentsList.appendChild(commentDiv);

                    // Scroll to bottom
                    commentsList.scrollTop = commentsList.scrollHeight;

                    // Update Counts
                    const currentCount = parseInt(commentCountSpan.innerText) + 1;
                    commentCountSpan.innerText = currentCount;
                    headerCountSpan.innerText = currentCount;

                    commentInput.value = '';
                } else {
                    alert('Failed to post comment');
                }
            } catch (err) {
                console.error(err);
            }
        };

        postCommentBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            postComment();
        });

        commentInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') postComment();
        });

        // Download Action
        // Options Menu Logic (Universal)
        const optionsBtn = div.querySelector('.options-btn');
        const dropdown = div.querySelector('.options-dropdown');

        if (optionsBtn) {
            optionsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdown.classList.toggle('show');
            });
        }

        // Download Action (Universal)
        const downloadBtn = div.querySelector('.download-option');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    const response = await fetch(video.blobUrl);
                    const blob = await response.blob();
                    const blobUrl = window.URL.createObjectURL(blob);

                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = blobUrl;
                    a.download = `${video.title || 'video'}.mp4`;
                    document.body.appendChild(a);
                    a.click();

                    window.URL.revokeObjectURL(blobUrl);
                    a.remove();
                    dropdown.classList.remove('show');
                } catch (err) {
                    console.error("Download failed", err);
                    alert("Failed to download video.");
                }
            });
        }

        // Owner-only Actions
        if (isOwner) {
            const editBtn = div.querySelector('.edit-option');
            const deleteBtn = div.querySelector('.delete-option');

            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm("Are you sure you want to delete this video?")) {
                    try {
                        const res = await fetch(`/api/videos/${video.id}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (res.ok) {
                            div.remove();
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
                    url: window.location.href
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
                    video.play().catch(e => { /* Autoplay prevented */ });
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

    // -- Mobile Nav Auto-Hide Logic --
    (function setupMobileNav() {
        const sidebar = document.getElementById('sidebar');
        let navTimer;

        const showNav = () => {
            // Only run active logic if on mobile to avoid performance hit, 
            // though CSS handles the display anyway.
            if (window.innerWidth > 768) return;

            sidebar.classList.add('visible-nav');
            clearTimeout(navTimer);
            navTimer = setTimeout(() => {
                sidebar.classList.remove('visible-nav');
            }, 2000);
        };

        // Inputs to trigger nav
        document.addEventListener('touchstart', showNav, { passive: true });
        document.addEventListener('click', showNav);
        document.addEventListener('scroll', showNav, { passive: true });
        document.addEventListener('mousemove', () => {
            // Optional: if user uses mouse emulation on mobile
            if (window.innerWidth <= 768) showNav();
        });

        // Initialize invisible (CSS does this), wait for input.
    })();
});
