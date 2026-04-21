import redis from 'redis';
import { promisify } from 'util';

class RedisClient {
  constructor() {
    this.client = redis.createClient();

    this.client.on('error', (err) => {
      console.error(err);
    });

    if (typeof this.client.connect === 'function') {
      this.client.connect().catch((err) => {
        console.error(err);
      });
    }
  }

  isAlive() {
    if (typeof this.client.connected === 'boolean') {
      return this.client.connected;
    }
    if (typeof this.client.isReady === 'boolean') {
      return this.client.isReady;
    }
    return false;
  }

  async get(key) {
    const getAsync = promisify(this.client.get).bind(this.client);
    return getAsync(key);
  }

  async set(key, value, duration) {
    const setAsync = promisify(this.client.set).bind(this.client);
    if (duration) {
      await setAsync(key, value, 'EX', duration);
      return;
    }
    await setAsync(key, value);
  }

  async del(key) {
    const delAsync = promisify(this.client.del).bind(this.client);
    await delAsync(key);
  }
}

const redisClient = new RedisClient();

export { RedisClient, redisClient };
export default redisClient;
