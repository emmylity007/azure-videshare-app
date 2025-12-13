require('dotenv').config(); // Load env vars FIRST

const appInsights = require('applicationinsights');
// Only start App Insights if connection string is present
if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
    appInsights.setup().start();
} else {
    console.log("App Insights skipped (no connection string)");
}
const express = require('express');
const path = require('path');
const { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } = require('@azure/storage-blob');
const { CosmosClient } = require('@azure/cosmos');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Azure Configuration
const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const AZURE_STORAGE_CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER_NAME || 'videos';
const AZURE_COSMOS_ENDPOINT = process.env.AZURE_COSMOS_ENDPOINT;
const AZURE_COSMOS_KEY = process.env.AZURE_COSMOS_KEY;
const AZURE_COSMOS_DATABASE = process.env.AZURE_COSMOS_DATABASE || 'VideSocialDB';
const AZURE_COSMOS_CONTAINER = process.env.AZURE_COSMOS_CONTAINER || 'VideoMetadata';

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// ... [Existing Imports]

const AZURE_COSMOS_USERS_CONTAINER = 'Users';
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey'; // Use env in prod

// Initialize Cosmos Client
let cosmosContainer;
let usersContainer;

async function initApp() {
    try {
        if (!AZURE_COSMOS_ENDPOINT || !AZURE_COSMOS_KEY) {
            console.warn("Cosmos DB credentials not found. Metadata storage will fail.");
            return;
        }
        const client = new CosmosClient({ endpoint: AZURE_COSMOS_ENDPOINT, key: AZURE_COSMOS_KEY });
        const { database } = await client.databases.createIfNotExists({ id: AZURE_COSMOS_DATABASE });

        const { container: vContainer } = await database.containers.createIfNotExists({ id: AZURE_COSMOS_CONTAINER, partitionKey: '/id' });
        cosmosContainer = vContainer;

        const { container: uContainer } = await database.containers.createIfNotExists({ id: AZURE_COSMOS_USERS_CONTAINER, partitionKey: '/id' });
        usersContainer = uContainer; // Ensure this is assigned!

        console.log("Cosmos DB initialized (Videos & Users)");

        // Start Server ONLY after DB is ready
        app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
        });

    } catch (err) {
        console.error("Failed to initialize Cosmos DB:", err);
    }
}
initApp();

// Middleware: Authenticate Token
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (token == null) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

// ... [Blob Storage Init]

// API: Auth - Signup
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) return res.status(400).send("Username, Email, and Password required");

        // Check if email already exists
        const { resources: existingUsers } = await usersContainer.items
            .query({
                query: "SELECT * FROM c WHERE c.email = @email",
                parameters: [{ name: "@email", value: email }]
            })
            .fetchAll();

        if (existingUsers.length > 0) return res.status(409).send("User with this email already exists");

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = {
            id: username + '-' + Date.now(),
            username,
            email,
            password: hashedPassword,
            createdAt: new Date()
        };

        await usersContainer.items.create(newUser);
        res.status(201).send("User created");
    } catch (error) {
        console.error("Signup error:", error);
        res.status(500).send("Error creating user");
    }
});

// API: Auth - Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const { resources: users } = await usersContainer.items
            .query({
                query: "SELECT * FROM c WHERE c.email = @email",
                parameters: [{ name: "@email", value: email }]
            })
            .fetchAll();

        if (users.length === 0) return res.status(400).send("User not found");
        const user = users[0];

        if (await bcrypt.compare(password, user.password)) {
            const accessToken = jwt.sign({ username: user.username, id: user.id }, JWT_SECRET);
            res.json({ accessToken });
        } else {
            res.status(403).send("Invalid credentials");
        }
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).send("Error logging in");
    }
});

// API: Get SAS Token for Upload (Protected)
app.get('/api/sas-token', authenticateToken, async (req, res) => {
    try {
        const { filename } = req.query;
        // ... [Rest of SAS endpoint]
        if (!filename) return res.status(400).send("Filename required");

        const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
        const containerClient = blobServiceClient.getContainerClient(AZURE_STORAGE_CONTAINER_NAME);
        const blobClient = containerClient.getBlockBlobClient(filename);

        const sasOptions = {
            containerName: AZURE_STORAGE_CONTAINER_NAME,
            blobName: filename,
            permissions: BlobSASPermissions.parse("w"), // Write permission
            expiresOn: new Date(new Date().valueOf() + 3600 * 1000) // 1 hour
        };

        // We need the key to sign the SAS token. 
        // Parsing connection string is a bit manual if we don't have the shared key credential object directly sometimes, 
        // but BlobServiceClient handles many things. However, generateBlobSASQueryParameters needs a credential.

        // Extract account name and key from connection string for SAS generation
        // A simple way to get a SAS url is utilizing the blob client if authorized with SharedKey
        const sasToken = await blobClient.generateSasUrl(sasOptions);
        // Note: generateSasUrl might not work directly if not authenticated with SharedKeyCredential in the client factory.
        // Let's re-instantiate specifically for SAS generation if needed, or rely on the fact that fromConnectionString usually sets up the credential.

        // Actually, let's do it explicitly to be safe:
        // Parse connection string
        const matches = AZURE_STORAGE_CONNECTION_STRING.match(/AccountName=([^;]+);AccountKey=([^;]+)/);
        if (!matches) throw new Error("Invalid Connection String");
        const accountName = matches[1];
        const accountKey = matches[2];
        const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);

        const sasTokenParams = generateBlobSASQueryParameters(sasOptions, sharedKeyCredential);

        const sasUrl = `${blobClient.url}?${sasTokenParams.toString()}`;

        res.json({ sasUrl, uploadUrl: sasUrl }); // sending sasUrl which is full URL with SAS token
    } catch (error) {
        console.error("Error generating SAS:", error);
        res.status(500).send("Internal Server Error");
    }
});

// API: Save Metadata (Protected)
app.post('/api/video-metadata', authenticateToken, async (req, res) => {
    try {
        const { title, description, filename, blobUrl } = req.body;

        if (!cosmosContainer) return res.status(503).send("Database not initialized");

        const newItem = {
            id: filename + '-' + Date.now(), // unique id
            title,
            description,
            filename,
            blobUrl,
            createdBy: req.user.username, // From JWT
            uploadDate: new Date()
        };

        const { resource: createdItem } = await cosmosContainer.items.create(newItem);
        res.status(201).json(createdItem);
    } catch (error) {
        console.error("Error saving metadata:", error);
        res.status(500).send("Error saving data");
    }
});

// API: Get All Videos (Feed)
app.get('/api/videos', async (req, res) => {
    try {
        if (!cosmosContainer) return res.status(503).send("Database not initialized");

        // Query all videos, sorted by date desc
        const { resources: videos } = await cosmosContainer.items
            .query("SELECT * FROM c ORDER BY c.uploadDate DESC")
            .fetchAll();

        // Generate Read SAS tokens for each video to ensure they are playable (even if private)
        // Parse connection string once
        const matches = AZURE_STORAGE_CONNECTION_STRING.match(/AccountName=([^;]+);AccountKey=([^;]+)/);
        if (!matches) throw new Error("Invalid Connection String");
        const accountName = matches[1];
        const accountKey = matches[2];
        const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);

        const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
        const containerClient = blobServiceClient.getContainerClient(AZURE_STORAGE_CONTAINER_NAME);

        const videosWithSas = await Promise.all(videos.map(async (video) => {
            try {
                // Check if blobUrl is from our container (simple check)
                if (video.blobUrl && video.blobUrl.includes(accountName) && video.filename) {
                    const sasOptions = {
                        containerName: AZURE_STORAGE_CONTAINER_NAME,
                        blobName: video.filename,
                        permissions: BlobSASPermissions.parse("r"), // Read permission
                        expiresOn: new Date(new Date().valueOf() + 3600 * 1000) // 1 hour
                    };

                    const sasTokenParams = generateBlobSASQueryParameters(sasOptions, sharedKeyCredential);
                    // Append SAS token to blobUrl
                    const videoWithSas = { ...video };
                    videoWithSas.blobUrl = `${video.blobUrl}?${sasTokenParams.toString()}`;
                    return videoWithSas;
                }
                return video;
            } catch (e) {
                console.error("SAS gen error for video " + video.id, e);
                return video; // Return original if fails
            }
        }));

        res.json(videosWithSas);
    } catch (error) {
        console.error("Feed error:", error);
        res.status(500).send("Error fetching feed");
    }
});

// API: Like Video
app.post('/api/videos/:id/like', authenticateToken, async (req, res) => {
    try {
        const videoId = req.params.id;
        const userId = req.user.id; // From JWT

        // In a real app, strict relation tables are better. 
        // Here we can store likes in a separate container or array in video doc.
        // Let's use a separate container 'Interactions' if we initialized it, 
        // but to keep it simple with existing containers, we'll update the Video document 
        // by adding the userId to a 'likes' array. 
        // Limitation: 2MB doc size limit.

        const { resource: video } = await cosmosContainer.item(videoId, videoId).read();
        if (!video) return res.status(404).send("Video not found");

        if (!video.likes) video.likes = [];

        const index = video.likes.indexOf(userId);
        if (index === -1) {
            video.likes.push(userId); // Like
        } else {
            video.likes.splice(index, 1); // Unlike
        }

        const { resource: updatedVideo } = await cosmosContainer.item(videoId, videoId).replace(video);
        res.json({ likes: updatedVideo.likes.length, liked: index === -1 });

    } catch (error) {
        console.error("Like error:", error);
        res.status(500).send("Error liking video");
    }
});

// API: Add Comment
app.post('/api/videos/:id/comments', authenticateToken, async (req, res) => {
    try {
        const videoId = req.params.id;
        const { text } = req.body;
        if (!text) return res.status(400).send("Comment text required");

        const { resource: video } = await cosmosContainer.item(videoId, videoId).read();
        if (!video) return res.status(404).send("Video not found");

        if (!video.comments) video.comments = [];

        const newComment = {
            id: Date.now().toString(),
            userId: req.user.id,
            username: req.user.username,
            text,
            date: new Date()
        };

        video.comments.push(newComment);

        await cosmosContainer.item(videoId, videoId).replace(video);
        res.status(201).json(newComment);

    } catch (error) {
        console.error("Comment error:", error);
        res.status(500).send("Error commenting");
    }
});

// API: Delete Video
app.delete('/api/videos/:id', authenticateToken, async (req, res) => {
    try {
        const videoId = req.params.id;
        // Verify ownership
        const { resource: video } = await cosmosContainer.item(videoId, videoId).read();

        if (!video) return res.status(404).send("Video not found");
        if (video.createdBy !== req.user.username) return res.status(403).send("Unauthorized");

        await cosmosContainer.item(videoId, videoId).delete();
        res.status(204).send();
    } catch (error) {
        console.error("Delete error:", error);
        res.status(500).send("Error deleting video");
    }
});

// API: Edit Video
app.put('/api/videos/:id', authenticateToken, async (req, res) => {
    try {
        const videoId = req.params.id;
        const { title, description } = req.body;

        const { resource: video } = await cosmosContainer.item(videoId, videoId).read();

        if (!video) return res.status(404).send("Video not found");
        if (video.createdBy !== req.user.username) return res.status(403).send("Unauthorized");

        video.title = title || video.title;
        video.description = description || video.description;

        const { resource: updatedVideo } = await cosmosContainer.item(videoId, videoId).replace(video);
        res.json(updatedVideo);
    } catch (error) {
        console.error("Edit error:", error);
        res.status(500).send("Error updating video");
    }
});

// Server started in initApp()
