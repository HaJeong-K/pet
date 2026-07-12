import { PutCommand, QueryCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import crypto from "node:crypto";
import { ddb } from "../common/dynamo.mjs";
import { ok, fail } from "../common/response.mjs";

const TABLE = process.env.REPLIES_TABLE;

export const handler = async (event) => {
  const method = event.requestContext.http.method;
  const { reviewId, replyId } = event.pathParameters || {};

  try {
    if (method === "GET" && reviewId) {
      const { Items } = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "reviewId-index",
        KeyConditionExpression: "reviewId = :r",
        ExpressionAttributeValues: { ":r": reviewId },
        ScanIndexForward: true,
      }));
      return ok(Items || []);
    }

    if (method === "POST" && reviewId) {
      const body = JSON.parse(event.body || "{}");
      if (!body.nickname || !body.content) return fail("닉네임과 내용은 필수입니다.");
      const item = {
        replyId: crypto.randomUUID(),
        reviewId,
        nickname: body.nickname,
        content: body.content,
        userKey: body.userKey || null,
        likes: 0,
        isAdminDeleted: false,
        isEdited: false,
        createdAt: new Date().toISOString(),
      };
      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
      return ok(item, 201);
    }

    if (method === "PUT" && replyId) {
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
        Key: { replyId },
        UpdateExpression: "SET " + sets.join(", "),
        ExpressionAttributeNames,
        ExpressionAttributeValues,
      }));
      return ok({ replyId, updated: keys });
    }

    if (method === "DELETE" && replyId) {
      await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { replyId } }));
      return ok({ deleted: replyId });
    }

    return fail("지원하지 않는 요청입니다.", 405);
  } catch (err) {
    console.error(err);
    return fail(err.message, 500);
  }
};