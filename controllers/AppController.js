import redisClientUtils from '../utils/redis';
import dbClientUtils from '../utils/db';

class AppController {
  static getStatus(req, res) {
    res.status(200).json({
      redis: redisClientUtils.isAlive(),
      db: dbClientUtils.isAlive(),
    });
  }

  static async getStats(req, res) {
    const [users, files] = await Promise.all([
      dbClientUtils.nbUsers(),
      dbClientUtils.nbFiles(),
    ]);

    res.status(200).json({ users, files });
  }
}

export default AppController;
