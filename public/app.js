document.addEventListener('DOMContentLoaded', () => {
    const uploadForm = document.getElementById('uploadForm');
    const fileInput = document.getElementById('videoFile');
    const fileLabelText = document.getElementById('fileLabelText');
    const uploadBtn = document.getElementById('uploadBtn');
    const statusMessage = document.getElementById('statusMessage');
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');

    fileInput.addEventListener('change', (e) => {
        if (fileInput.files.length > 0) {
            fileLabelText.textContent = fileInput.files[0].name;
        } else {
            fileLabelText.textContent = "Choose Video File";
        }
    });

    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();

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
            // Using a timestamp to ensure unique filenames in blob storage
            const uniqueFilename = `${Date.now()}-${file.name}`;
            const sasResponse = await fetch(`/api/sas-token?filename=${encodeURIComponent(uniqueFilename)}`);

            if (!sasResponse.ok) {
                throw new Error("Failed to get upload authorization");
            }

            const { sasUrl, uploadUrl } = await sasResponse.json();

            // 2. Upload to Azure Blob Storage using PUT (Block Blob)
            // Note: For very large files, chunked upload is better, but simple PUT works for < 256MB usually.
            // Using logic agnostic XHR or fetch for upload to track progress.
            // But we can also use the Azure SDK for JS browser if included, but a direct PUT is simpler without heavy bundle.

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
                    // Upload success

                    // 3. Save Metadata
                    // We need the clean Blob URL without SAS token to store
                    const blobUrlWithoutSas = uploadUrl.split('?')[0];

                    const metadataResponse = await fetch('/api/video-metadata', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
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
