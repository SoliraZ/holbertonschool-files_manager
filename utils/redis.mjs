import { createClient } from 'redis';

class RedisClient {
  constructor() {
    this.client = createClient();

    this.client.on('error', (err) => {
      console.error(err);
    });

    this.client.connect().catch((err) => {
      console.error(err);
    });
  }

  isAlive() {
    return this.client.isOpen;
  }

  async get(key) {
    return this.client.get(key);
  }

  async set(key, value, duration) {
    await this.client.set(key, value, { EX: duration });
  }

  async del(key) {
    await this.client.del(key);
  }
}

const redisClient = new RedisClient();

export { RedisClient, redisClient };
export default redisClient;
