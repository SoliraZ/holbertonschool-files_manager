import Bull from 'bull';

const fileQueue = new Bull('fileQueue');

export default fileQueue;
