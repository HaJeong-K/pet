import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ok, fail } from "../common/response.mjs";

const s3 = new S3Client({});
const BUCKET = process.env.IMAGE_BUCKET;

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const { fileName, contentType, folder } = body; // folder: "places" | "proposals"
    if (!fileName || !contentType) return fail("fileName, contentType이 필요합니다.");

    const key = `${folder || "misc"}/${Date.now()}_${fileName}`;
    const command = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType });
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 60 });
    const publicUrl = `https://${BUCKET}.s3.ap-northeast-2.amazonaws.com/${key}`;

    return ok({ uploadUrl, publicUrl });
  } catch (err) {
    console.error(err);
    return fail(err.message, 500);
  }
};