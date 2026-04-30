import fs from 'fs/promises';
import imageThumbnail from 'image-thumbnail';
import mongodb from 'mongodb';
import dbClientUtils from './utils/db';
import fileQueueUtils from './utils/fileQueue';

const { ObjectId } = mongodb;

fileQueueUtils.process(async (job, done) => {
  try {
    const { fileId, userId } = job.data || {};

    if (!fileId) {
      throw new Error('Missing fileId');
    }

    if (!userId) {
      throw new Error('Missing userId');
    }

    if (!ObjectId.isValid(fileId) || !ObjectId.isValid(userId)) {
      throw new Error('File not found');
    }

    const fileDocument = await dbClientUtils.db.collection('files').findOne({
      _id: new ObjectId(fileId),
      userId: new ObjectId(userId),
    });

    if (!fileDocument) {
      throw new Error('File not found');
    }

    const sizes = [500, 250, 100];
    await Promise.all(sizes.map(async (size) => {
      const thumbnail = await imageThumbnail(fileDocument.localPath, { width: size });
      await fs.writeFile(`${fileDocument.localPath}_${size}`, thumbnail);
    }));

    done();
  } catch (error) {
    done(error);
  }
});
