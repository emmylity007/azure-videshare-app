const appInsights = require('applicationinsights');
appInsights.setup().start();

require('dotenv').config();
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

// Initialize Cosmos Client
let cosmosContainer;
async function initCosmos() {
    if (!AZURE_COSMOS_ENDPOINT || !AZURE_COSMOS_KEY) {
        console.warn("Cosmos DB credentials not found. Metadata storage will fail.");
        return;
    }
    const client = new CosmosClient({ endpoint: AZURE_COSMOS_ENDPOINT, key: AZURE_COSMOS_KEY });
    const { database } = await client.databases.createIfNotExists({ id: AZURE_COSMOS_DATABASE });
    const { container } = await database.containers.createIfNotExists({ id: AZURE_COSMOS_CONTAINER });
    cosmosContainer = container;
    console.log("Cosmos DB initialized");
}
initCosmos().catch(console.error);

// Ensure Blob Container Exists
async function initBlobStorage() {
    if (!AZURE_STORAGE_CONNECTION_STRING) {
        console.warn("Azure Storage Connection String not found. Uploads will fail.");
        return;
    }
    const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
    const containerClient = blobServiceClient.getContainerClient(AZURE_STORAGE_CONTAINER_NAME);
    await containerClient.createIfNotExists({ access: 'blob' }); // Set public access to blob level if needed so users can view videos
    console.log("Blob Storage container initialized");
}
initBlobStorage().catch(console.error);


// API: Get SAS Token for Upload
app.get('/api/sas-token', async (req, res) => {
    try {
        const { filename } = req.query;
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

// API: Save Metadata
app.post('/api/video-metadata', async (req, res) => {
    try {
        const { title, description, filename, blobUrl } = req.body;

        if (!cosmosContainer) return res.status(503).send("Database not initialized");

        const newItem = {
            id: filename + '-' + Date.now(), // unique id
            title,
            description,
            filename,
            blobUrl,
            uploadDate: new Date()
        };

        const { resource: createdItem } = await cosmosContainer.items.create(newItem);
        res.status(201).json(createdItem);
    } catch (error) {
        console.error("Error saving metadata:", error);
        res.status(500).send("Error saving data");
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
