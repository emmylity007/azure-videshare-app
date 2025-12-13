// Make functions globally available
window.openUploadModal = function () {
    document.getElementById('uploadModal').classList.add('show');
}

window.closeUploadModal = function () {
    document.getElementById('uploadModal').classList.remove('show');
}

// Close when clicking outside
window.onclick = function (event) {
    const modal = document.getElementById('uploadModal');
    if (event.target == modal) {
        modal.classList.remove('show');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const uploadForm = document.getElementById('uploadForm');
    // If not on a page with upload form, skip
    if (!uploadForm) return;

    const fileInput = document.getElementById('videoFile');
    const fileLabelText = document.getElementById('fileLabelText');
    const uploadBtn = document.getElementById('uploadBtn');
    const statusMessage = document.getElementById('statusMessage');
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');

    // Auth Check
    const token = localStorage.getItem('token');
    // Note: We don't redirect here anymore because this script might run on index.html where guest access is allowed.
    // Validation happens on upload attempt.

    // Logout Logic
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('token');
            window.location.href = 'login.html';
        });
    }

    fileInput.addEventListener('change', (e) => {
        if (fileInput.files.length > 0) {
            fileLabelText.textContent = fileInput.files[0].name;
        } else {
            fileLabelText.textContent = "Choose Video File";
        }
    });

    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!token) {
            alert("Please login to upload videos.");
            window.location.href = 'login.html';
            return;
        }

        const file = fileInput.files[0];
        const title = document.getElementById('title').value;
        const description = document.getElementById('description').value;

        if (!file) {
            statusMessage.textContent = "Please select a file.";
            statusMessage.style.color = "red";
            return;
        }

        uploadBtn.disabled = true;
        uploadBtn.textContent = "Uploading...";
        statusMessage.textContent = "";
        progressContainer.style.display = 'block';
        progressBar.style.width = '0%';
        progressText.textContent = '0%';

        try {
            // 1. Get SAS URL from backend
            const uniqueFilename = `${Date.now()}-${file.name}`;
            const sasResponse = await fetch(`/api/sas-token?filename=${encodeURIComponent(uniqueFilename)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!sasResponse.ok) {
                if (sasResponse.status === 401 || sasResponse.status === 403) {
                    alert("Session expired. Please login again.");
                    localStorage.removeItem('token');
                    window.location.href = 'login.html';
                    return;
                }
                throw new Error("Failed to get upload authorization");
            }

            const { sasUrl, uploadUrl } = await sasResponse.json();

            // 2. Upload to Azure Blob Storage using PUT (Block Blob)
            const xhr = new XMLHttpRequest();
            xhr.open("PUT", uploadUrl, true);
            xhr.setRequestHeader('x-ms-blob-type', 'BlockBlob'); // Required for Block Blob

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percentComplete = Math.round((event.loaded / event.total) * 100);
                    progressBar.style.width = percentComplete + '%';
                    progressText.textContent = percentComplete + '%';
                }
            };

            xhr.onload = async () => {
                if (xhr.status === 201 || xhr.status === 200) {
                    // 3. Save Metadata
                    const blobUrlWithoutSas = uploadUrl.split('?')[0];

                    const metadataResponse = await fetch('/api/video-metadata', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            title,
                            description,
                            filename: uniqueFilename,
                            blobUrl: blobUrlWithoutSas
                        })
                    });

                    if (metadataResponse.ok) {
                        statusMessage.textContent = "Upload successful!";
                        statusMessage.style.color = "#4ade80"; // green
                        uploadForm.reset();
                        fileLabelText.textContent = "Choose Video File";
                        progressBar.style.width = '100%';
                        progressText.textContent = '100%';

                        setTimeout(() => {
                            window.closeUploadModal();
                            window.location.reload(); // Refresh feed to show new video
                        }, 1000);
                    } else {
                        throw new Error("Video uploaded but failed to save metadata.");
                    }

                } else {
                    console.error("Upload failed:", xhr.responseText);
                    throw new Error("Upload failed to Azure Blob Storage.");
                }
                uploadBtn.disabled = false;
                uploadBtn.textContent = "Upload Video";
                setTimeout(() => { progressContainer.style.display = 'none'; }, 3000);
            };

            xhr.onerror = () => {
                throw new Error("Network error during upload.");
            };

            xhr.send(file);

        } catch (error) {
            console.error(error);
            statusMessage.textContent = `Error: ${error.message}`;
            statusMessage.style.color = "red";
            uploadBtn.disabled = false;
            uploadBtn.textContent = "Upload Video";
            progressContainer.style.display = 'none';
        }
    });
});
