const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

class CacheManager {
    constructor() {
        // Prioritize /tmp for Railway, fallback to local for development
        this.cachePath = process.env.RAILWAY_ENVIRONMENT
            ? '/tmp/trends-cache.json'
            : path.join(__dirname, 'trends-cache.json');
        this.TTL = 35 * 60 * 1000; // 35 minutes
        this.version = '1.0';
    }

    async loadCache() {
        try {
            const data = await fs.readFile(this.cachePath, 'utf8');
            const cache = JSON.parse(data);

            // Validate structure
            if (!cache.data || !Array.isArray(cache.data) || !cache.timestamp) {
                logger.warn('Invalid cache structure, ignoring cache file');
                return null;
            }

            const age = Date.now() - cache.timestamp;
            const isValid = age < this.TTL;

            logger.info(`Cache loaded: ${cache.data.length} trends, age: ${Math.round(age/1000)}s, valid: ${isValid}`);

            return {
                data: cache.data,
                timestamp: cache.timestamp,
                isValid,
                age
            };
        } catch (error) {
            if (error.code === 'ENOENT') {
                logger.info('No cache file found');
            } else {
                logger.warn(`Error loading cache: ${error.message}`);
                // Try to delete corrupt cache
                try {
                    await fs.unlink(this.cachePath);
                    logger.info('Deleted corrupt cache file');
                } catch (e) {
                    // Ignore deletion errors
                }
            }
            return null;
        }
    }

    async saveCache(data) {
        try {
            const cache = {
                version: this.version,
                timestamp: Date.now(),
                data
            };

            // Write to temp file first, then rename (atomic operation)
            const tempPath = this.cachePath + '.tmp';
            await fs.writeFile(tempPath, JSON.stringify(cache), 'utf8');
            await fs.rename(tempPath, this.cachePath);

            logger.info(`Cache saved: ${data.length} trends`);
            return true;
        } catch (error) {
            logger.error(`Error saving cache: ${error.message}`);
            return false;
        }
    }

    isCacheValid(timestamp) {
        return (Date.now() - timestamp) < this.TTL;
    }

    getCacheAge(timestamp) {
        return Date.now() - timestamp;
    }
}

module.exports = new CacheManager();
