document.addEventListener('DOMContentLoaded', async () => {
    let isGlobalMuted = true; // Global Audio State

    // Auth Check (Optional for Feed now)
    const token = localStorage.getItem('token');
    // REMOVED restricted access check

    const feedContainer = document.getElementById('feedContainer');
    const logoutNav = document.getElementById('logoutNav');
    const userProfile = document.getElementById('userProfile');

    // Unified Profile & Auth Logic
    if (userProfile) {
        let username = 'Guest';
        let initial = 'G';
        let authHtml = `
            <div class="dropdown-item login-item" onclick="window.location.href='login.html'">
                <ion-icon name="log-in-outline"></ion-icon> Sign In
            </div>
        `;

        // If Logged In, overwrite with User Data
        if (token) {
            try {
                const decoded = parseJwt(token);
                let userRaw = decoded.username || 'User';
                // Capitalize first letter
                username = userRaw.charAt(0).toUpperCase() + userRaw.slice(1);
                initial = username.charAt(0);
                authHtml = `
                    <div class="dropdown-item">
                        <ion-icon name="person-outline"></ion-icon> Profile
                    </div>
                    <div class="dropdown-item">
                        <ion-icon name="settings-outline"></ion-icon> Settings
                    </div>
                    <div class="dropdown-item logout-item" id="logoutBtn">
                        <ion-icon name="log-out-outline"></ion-icon> Sign Out
                    </div>
                `;
            } catch (e) { console.error("Invalid token", e); }
        }

        // Render Profile (Icon Only + Dropdown)
        userProfile.innerHTML = `
            <div class="profile-avatar" style="cursor: pointer;">${initial}</div>
            
            <!-- Profile Dropdown -->
            <div class="profile-dropdown">
                <div class="dropdown-header" style="padding: 0.5rem 1rem; border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 0.5rem; color: #ccc; font-size: 0.9rem;">
                    ${username}
                </div>
                ${authHtml}
            </div>
        `;

        // Toggle Dropdown
        userProfile.addEventListener('click', (e) => {
            e.preventDefault();
            userProfile.classList.toggle('active');
        });

        // Logout Event Listener (if exists)
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
    }

    // Hide old logout nav if it exists (it should be empty now as we use Profile for everything)
    if (logoutNav) logoutNav.style.display = 'none';

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
                <video class="video-player" src="${video.blobUrl}" data-id="${video.id}" loop playsinline></video>
                <div class="video-progress-container">
                    <div class="video-progress-bar"></div>
                </div>
                <!-- Desktop/Mobile Top Overlay -->
                <!-- Mute (Top Left) & Options (Top Right) -->
                <div class="overlay-top" style="position: absolute; top: 0; left: 0; width: 100%; padding: 1rem; display: flex; justify-content: space-between; align-items: flex-start; z-index: 10; pointer-events: none;">
                    <button class="action-btn mute-btn" style="pointer-events: auto;">
                        <ion-icon name="${isGlobalMuted ? 'volume-mute' : 'volume-high'}"></ion-icon>
                    </button>

                </div>





                </div>

            <div class="meta-panel">
                    <!-- Right Sidebar / Mobile Overlay -->
                    
                    <div class="video-info">
                        <h3>@${video.createdBy || 'anonymous'}</h3>
                        <p class="video-title">${video.title}</p>
                        <p class="video-desc" style="font-size: 0.8rem; display: block;">${video.description || ''}</p> 
                    </div>

                    <div class="actions">
                        <button class="action-btn view-btn" style="cursor: default;">
                            <ion-icon name="eye"></ion-icon>
                            <span class="view-count">${video.views || 0}</span>
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
                        <div class="options-menu-container" style="position: relative;">
                            ${optionsButtonHTML}
                        </div>
                    </div>


                    <div class="comments-section">
                        <div class="panel-header">
                            <h3>Comments (<span class="comment-count-header">${video.comments ? video.comments.length : 0}</span>)</h3>
                            <button class="close-comments"><ion-icon name="close-outline"></ion-icon></button>
                        </div>
                        <div class="comment-input-area">
                            <input type="text" placeholder="Add a comment..." class="comment-input">
                            <button class="post-comment-btn"><ion-icon name="send"></ion-icon></button>
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
        const metaPanel = div.querySelector('.meta-panel');
        const closeCommentsBtn = div.querySelector('.close-comments');
        const postCommentBtn = div.querySelector('.post-comment-btn');
        const commentInput = div.querySelector('.comment-input');
        const commentsList = div.querySelector('.comments-list');
        const commentCountSpan = div.querySelector('.comment-btn span');
        const headerCountSpan = div.querySelector('.comment-count-header');

        const toggleComments = (e) => {
            if (e) e.stopPropagation();
            metaPanel.classList.toggle('open');
        };

        commentBtn.addEventListener('click', toggleComments);
        closeCommentsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            metaPanel.classList.remove('open');
        });

        // Prevent click inside panel from closing or pausing video
        metaPanel.addEventListener('click', (e) => e.stopPropagation());

        // TAP TO MUTE LOGIC (Replaces Play/Pause and Mute Button)
        const videoFrame = div.querySelector('.video-frame');

        const toggleGlobalMute = () => {
            // Toggle Global Mute State
            isGlobalMuted = !isGlobalMuted;

            // Apply to ALL videos to keep sync
            document.querySelectorAll('video').forEach(vid => {
                vid.muted = isGlobalMuted;
                if (!isGlobalMuted) {
                    vid.removeAttribute('muted'); // Ensure unmuted works
                }
            });

            // Update ALL Mute Buttons
            document.querySelectorAll('.mute-btn ion-icon').forEach(icon => {
                icon.name = isGlobalMuted ? 'volume-mute' : 'volume-high';
            });

            // Wake up Audio Engine if unmuting
            if (!isGlobalMuted) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (AudioContext) {
                    const ctx = new AudioContext();
                    ctx.resume().then(() => ctx.close());
                }
            }
        };

        const muteBtn = div.querySelector('.mute-btn');
        if (muteBtn) {
            muteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleGlobalMute();
            });
        }

        videoFrame.addEventListener('click', (e) => {
            // Ignore if clicking buttons/panels
            if (e.target.closest('button') || e.target.closest('.comments-panel') || e.target.closest('.options-menu-container')) return;

            e.preventDefault();
            e.stopPropagation();
            toggleGlobalMute();
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
                const res = await fetch(`/api/videos/${video.id}/comments`, {
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

        // Desktop Comment Toggle Logic
        // Universal Comment Toggle (Mobile & Desktop)
        // Mobile uses .open for transform. Desktop uses .open for display:flex.
        const commentBtns = div.querySelectorAll('.comment-btn');
        commentBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                div.querySelector('.meta-panel').classList.add('open');
            });
        });

        // Close Comment Panel
        const closeBtn = div.querySelector('.close-comments');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                div.querySelector('.meta-panel').classList.remove('open');
            });
        }

        commentInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') postComment();
        });

        // Download Action
        // Options Menu Logic (Universal)
        // Options Menu Logic (Universal)
        const optionsBtns = div.querySelectorAll('.options-btn');
        optionsBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Find sibling dropdown
                const container = btn.closest('.options-menu-container');
                const dd = container.querySelector('.options-dropdown');
                if (dd) dd.classList.toggle('show');
            });
        });

        // Download Action (Universal)
        // Download Action (Universal) - Loop for multiple download buttons if inherited
        const downloadBtns = div.querySelectorAll('.download-option');
        downloadBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                // Find closest dropdown to close it
                const closestDropdown = btn.closest('.options-dropdown');
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
                    if (closestDropdown) closestDropdown.classList.remove('show');
                } catch (err) {
                    console.error("Download failed", err);
                    alert("Failed to download video.");
                }
            });
        });

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
        // Like Action
        const likeBtns = div.querySelectorAll('.like-btn');
        likeBtns.forEach(likeBtn => {
            likeBtn.addEventListener('click', async () => {
                if (!token) {
                    alert("Please login to like videos!");
                    window.location.href = 'login.html';
                    return;
                }

                // Optimistic Update ALL like buttons for this video
                let currentLikes = parseInt(div.querySelector('.likes-count').textContent); // Read from one
                const isCurrentlyLiked = div.querySelector('.like-btn ion-icon').classList.contains('liked');

                // Update State Logic
                const newLikedState = !isCurrentlyLiked;
                const newCount = newLikedState ? currentLikes + 1 : Math.max(0, currentLikes - 1);

                // Update UI for ALL buttons
                div.querySelectorAll('.like-btn').forEach(btn => {
                    const icon = btn.querySelector('ion-icon');
                    const countSpan = btn.querySelector('.likes-count');

                    if (newLikedState) {
                        icon.name = 'heart';
                        icon.classList.add('liked');
                    } else {
                        icon.name = 'heart-outline';
                        icon.classList.remove('liked');
                    }
                    countSpan.textContent = newCount;
                });

                try {
                    const res = await fetch(`/api/videos/${video.id}/like`, {
                        // ... rest of fetch logic handled in loop? No, just fire once?
                        // Actually, the listener is added to EACH.
                        // We should fire the API call once per click.
                        // The loop is fine.
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    // We trust optimistic update or re-fetch?
                    // ... let's keep it simple.
                    // Wait, I replaced the fetch block too in startLine.
                    // I need to include the fetch in the replacement content.
                } catch (err) {
                    console.error("Like failed", err);
                }
            }); // End Click
        }); // End ForEach

        // Share Button Logic
        const shareBtn = div.querySelector('.share-btn');
        if (shareBtn) {
            shareBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const shareData = {
                    title: video.title || 'VideSocial Video',
                    text: `Check out this video by ${video.createdBy || 'User'}!`,
                    url: window.location.href // Current URL
                };

                if (navigator.share) {
                    try {
                        await navigator.share(shareData);
                    } catch (err) { console.log('Share canceled', err); }
                } else {
                    // Fallback
                    try {
                        await navigator.clipboard.writeText(window.location.href);
                        alert("Link copied to clipboard!");
                    } catch (err) { alert("Failed to copy link."); }
                }
            });
        }

        // Progress Bar Logic
        const progressVideo = div.querySelector('video');
        const progressBar = div.querySelector('.video-progress-bar');
        if (progressVideo && progressBar) {
            progressVideo.addEventListener('timeupdate', () => {
                const percent = (progressVideo.currentTime / progressVideo.duration) * 100;
                progressBar.style.width = `${percent}%`;
            });
        }



        return div;
    }

    function setupVideoObserver() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const video = entry.target.querySelector('video');
                if (entry.isIntersecting) {
                    const playPromise = video.play();
                    if (playPromise !== undefined) {
                        playPromise.catch(error => { });
                    }

                    // View Count Logic (1s threshold)
                    if (!video.dataset.viewed) {
                        video.dataset.viewTimer = setTimeout(() => {
                            video.dataset.viewed = "true";
                            const videoId = video.getAttribute('data-id');
                            console.log("Triggering view for:", videoId); // Debug
                            if (videoId) {
                                fetch(`/ api / videos / ${videoId}/view`, { method: 'POST' })
                                    .then(res => res.json())
                                    .then(data => {
                                        console.log("View updated:", data.views); // Debug
                                        // Update UI in the parent card
                                        const card = entry.target;
                                        const countSpan = card.querySelector('.view-count');
                                        if (countSpan) countSpan.textContent = data.views;
                                    })
                                    .catch(e => console.error("View inc error", e));
                            }
                        }, 1000); // 1 Second Threshold
                    }
                } else {
                    video.pause();
                    video.currentTime = 0; // Reset
                    // Clear timer if user scrolls away quickly
                    if (video.dataset.viewTimer) {
                        clearTimeout(parseInt(video.dataset.viewTimer));
                        delete video.dataset.viewTimer;
                    }
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
