import fs from 'fs/promises';
import path from 'path';
import mongodb from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import dbClientUtils from '../utils/db';
import redisClientUtils from '../utils/redis';

const { ObjectId } = mongodb;

class FilesController {
  static async postUpload(req, res) {
    const token = req.header('X-Token');
    const userId = await redisClientUtils.get(`auth_${token}`);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      name,
      type,
      data,
      parentId = 0,
      isPublic = false,
    } = req.body || {};

    if (!name) {
      return res.status(400).json({ error: 'Missing name' });
    }

    if (!type || !['folder', 'file', 'image'].includes(type)) {
      return res.status(400).json({ error: 'Missing type' });
    }

    if (type !== 'folder' && !data) {
      return res.status(400).json({ error: 'Missing data' });
    }

    let parent = null;
    if (parentId !== 0 && parentId !== '0') {
      if (!ObjectId.isValid(parentId)) {
        return res.status(400).json({ error: 'Parent not found' });
      }

      parent = await dbClientUtils.db.collection('files').findOne({
        _id: new ObjectId(parentId),
      });

      if (!parent) {
        return res.status(400).json({ error: 'Parent not found' });
      }

      if (parent.type !== 'folder') {
        return res.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    const fileDocument = {
      userId: new ObjectId(userId),
      name,
      type,
      isPublic,
      parentId,
    };

    if (type !== 'folder') {
      const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
      await fs.mkdir(folderPath, { recursive: true });

      const localPath = path.join(folderPath, uuidv4());
      const fileBuffer = Buffer.from(data, 'base64');
      await fs.writeFile(localPath, fileBuffer);
      fileDocument.localPath = localPath;
    }

    const result = await dbClientUtils.db.collection('files').insertOne(fileDocument);

    return res.status(201).json({
      id: result.insertedId.toString(),
      userId,
      name,
      type,
      isPublic,
      parentId,
    });
  }
}

export default FilesController;
