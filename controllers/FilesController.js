import fs from 'fs/promises';
import path from 'path';
import mime from 'mime-types';
import mongodb from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import dbClientUtils from '../utils/db';
import redisClientUtils from '../utils/redis';

const { ObjectId } = mongodb;

class FilesController {
  static formatFile(fileDocument) {
    return {
      id: fileDocument._id.toString(),
      userId: fileDocument.userId.toString(),
      name: fileDocument.name,
      type: fileDocument.type,
      isPublic: fileDocument.isPublic,
      parentId: fileDocument.parentId,
    };
  }

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

  static async getShow(req, res) {
    try {
      const token = req.header('X-Token');
      const userId = await redisClientUtils.get(`auth_${token}`);

      if (!userId || !ObjectId.isValid(userId)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const fileId = req.params.id;
      if (!ObjectId.isValid(fileId)) {
        return res.status(404).json({ error: 'Not found' });
      }

      const fileDocument = await dbClientUtils.db.collection('files').findOne({
        _id: new ObjectId(fileId),
        userId: new ObjectId(userId),
      });

      if (!fileDocument) {
        return res.status(404).json({ error: 'Not found' });
      }

      return res.status(200).json(FilesController.formatFile(fileDocument));
    } catch (error) {
      return res.status(500).json({ error: 'Internal error' });
    }
  }

  static async getIndex(req, res) {
    try {
      const token = req.header('X-Token');
      const userId = await redisClientUtils.get(`auth_${token}`);

      if (!userId || !ObjectId.isValid(userId)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const parentId = req.query.parentId || '0';
      const page = Number(req.query.page || 0);
      const pagination = Number.isNaN(page) || page < 0 ? 0 : page;
      let parentFilter = { $in: [0, '0'] };
      if (parentId !== '0') {
        if (ObjectId.isValid(parentId)) {
          parentFilter = { $in: [parentId, new ObjectId(parentId)] };
        } else {
          parentFilter = parentId;
        }
      }

      const files = await dbClientUtils.db.collection('files').find({
        userId: new ObjectId(userId),
        parentId: parentFilter,
      })
        .skip(pagination * 20)
        .limit(20)
        .toArray();

      return res.status(200).json(files.map((file) => FilesController.formatFile(file)));
    } catch (error) {
      return res.status(500).json({ error: 'Internal error' });
    }
  }

  static async updateFileVisibility(req, res, isPublic) {
    try {
      const token = req.header('X-Token');
      const userId = await redisClientUtils.get(`auth_${token}`);

      if (!userId || !ObjectId.isValid(userId)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const fileId = req.params.id;
      if (!ObjectId.isValid(fileId)) {
        return res.status(404).json({ error: 'Not found' });
      }

      const fileCollection = dbClientUtils.db.collection('files');
      const query = { _id: new ObjectId(fileId), userId: new ObjectId(userId) };
      const fileDocument = await fileCollection.findOne(query);

      if (!fileDocument) {
        return res.status(404).json({ error: 'Not found' });
      }

      await fileCollection.updateOne(query, { $set: { isPublic } });
      fileDocument.isPublic = isPublic;
      return res.status(200).json(FilesController.formatFile(fileDocument));
    } catch (error) {
      return res.status(500).json({ error: 'Internal error' });
    }
  }

  static async putPublish(req, res) {
    return FilesController.updateFileVisibility(req, res, true);
  }

  static async putUnpublish(req, res) {
    return FilesController.updateFileVisibility(req, res, false);
  }

  static async getFile(req, res) {
    try {
      const fileId = req.params.id;
      if (!ObjectId.isValid(fileId)) {
        return res.status(404).json({ error: 'Not found' });
      }

      const fileDocument = await dbClientUtils.db.collection('files').findOne({
        _id: new ObjectId(fileId),
      });

      if (!fileDocument) {
        return res.status(404).json({ error: 'Not found' });
      }

      if (fileDocument.type === 'folder') {
        return res.status(400).json({ error: "A folder doesn't have content" });
      }

      let authenticatedUserId = null;
      const token = req.header('X-Token');
      if (token) {
        authenticatedUserId = await redisClientUtils.get(`auth_${token}`);
      }

      const ownerId = fileDocument.userId ? fileDocument.userId.toString() : null;
      if (!fileDocument.isPublic && authenticatedUserId !== ownerId) {
        return res.status(404).json({ error: 'Not found' });
      }

      if (!fileDocument.localPath) {
        return res.status(404).json({ error: 'Not found' });
      }

      let fileContent;
      try {
        fileContent = await fs.readFile(fileDocument.localPath);
      } catch (error) {
        return res.status(404).json({ error: 'Not found' });
      }

      const mimeType = mime.lookup(fileDocument.name) || 'text/plain';
      res.setHeader('Content-Type', mimeType);
      return res.status(200).send(fileContent);
    } catch (error) {
      return res.status(500).json({ error: 'Internal error' });
    }
  }
}

export default FilesController;
