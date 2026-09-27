/** The multipart file shape the avatar endpoint consumes (multer memory storage). */
export interface UploadedAvatar {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
}
