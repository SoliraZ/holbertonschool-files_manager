import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import dbClientUtils from '../utils/db';
import redisClientUtils from '../utils/redis';

class AuthController {
  static async getConnect(req, res) {
    const authorization = req.header('Authorization') || '';

    if (!authorization.startsWith('Basic ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const encoded = authorization.slice(6);
    const decoded = Buffer.from(encoded, 'base64').toString();
    const [email, password] = decoded.split(':');

    if (!email || !password) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const hashedPassword = createHash('sha1').update(password).digest('hex');
    const user = await dbClientUtils.db.collection('users').findOne({
      email,
      password: hashedPassword,
    });

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = uuidv4();
    await redisClientUtils.set(`auth_${token}`, user._id.toString(), 24 * 3600);
    return res.status(200).json({ token });
  }

  static async getDisconnect(req, res) {
    const token = req.header('X-Token');

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const key = `auth_${token}`;
    const userId = await redisClientUtils.get(key);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await redisClientUtils.del(key);
    return res.status(204).send();
  }
}

export default AuthController;
