import { GetCommand, PutCommand, QueryCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import crypto from "node:crypto";
import { ddb } from "../common/dynamo.mjs";
import { ok, fail } from "../common/response.mjs";

const TABLE = process.env.REVIEWS_TABLE;

export const handler = async (event) => {
  const method = event.requestContext.http.method;
  const { placeId, reviewId } = event.pathParameters || {};

  try {
    if (method === "GET" && placeId) {
      const { Items } = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "placeId-index",
        KeyConditionExpression: "placeId = :p",
        ExpressionAttributeValues: { ":p": placeId },
        ScanIndexForward: false, // 최신순
      }));
      return ok(Items || []);
    }

    if (method === "POST" && placeId) {
      const body = JSON.parse(event.body || "{}");
      if (!body.nickname || !body.content) return fail("닉네임과 내용은 필수입니다.");
      const item = {
        reviewId: crypto.randomUUID(),
        placeId,
        nickname: body.nickname,
        content: body.content,
        userKey: body.userKey || null,
        likes: 0,
        deleted: false,
        isAdminDeleted: false,
        isEdited: false,
        createdAt: new Date().toISOString(),
      };
      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
      return ok(item, 201);
    }

    if (method === "PUT" && reviewId) {
      const body = JSON.parse(event.body || "{}");
      const keys = Object.keys(body);
      const ExpressionAttributeNames = {};
      const ExpressionAttributeValues = {};
      const sets = keys.map((k, i) => {
        ExpressionAttributeNames[`#f${i}`] = k;
        ExpressionAttributeValues[`:v${i}`] = body[k];
        return `#f${i} = :v${i}`;
      });
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { reviewId },
        UpdateExpression: "SET " + sets.join(", "),
        ExpressionAttributeNames,
        ExpressionAttributeValues,
      }));
      return ok({ reviewId, updated: keys });
    }

    if (method === "DELETE" && reviewId) {
      await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { reviewId } }));
      return ok({ deleted: reviewId });
    }

    return fail("지원하지 않는 요청입니다.", 405);
  } catch (err) {
    console.error(err);
    return fail(err.message, 500);
  }
};