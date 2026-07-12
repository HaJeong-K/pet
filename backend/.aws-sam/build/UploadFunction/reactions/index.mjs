import { GetCommand, PutCommand, DeleteCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../common/dynamo.mjs";
import { ok, fail } from "../common/response.mjs";

const REACTIONS = process.env.REACTIONS_TABLE;
const PLACES = process.env.PLACES_TABLE;
const REVIEWS = process.env.REVIEWS_TABLE;
const REPLIES = process.env.REPLIES_TABLE;

const COUNTER_FIELD = { like: "likeCount", dislike: "dislikeCount", bookmark: "bookmarkCount" };
const TABLE_BY_TYPE = { place: PLACES, review: REVIEWS, reply: REPLIES };
const KEY_BY_TYPE = { place: "placeId", review: "reviewId", reply: "replyId" };

export const handler = async (event) => {
  const method = event.requestContext.http.method;

  try {
    if (method === "GET") {
      // ?targetId=xxx&userKey=yyy  → 내가 이 대상에 남긴 반응 목록
      const { targetId, userKey } = event.queryStringParameters || {};
      if (!targetId || !userKey) return fail("targetId, userKey가 필요합니다.");
      const { Items } = await ddb.send(new QueryCommand({
        TableName: REACTIONS,
        KeyConditionExpression: "targetId = :t AND begins_with(sk, :u)",
        ExpressionAttributeValues: { ":t": targetId, ":u": `${userKey}#` },
      }));
      return ok((Items || []).map((i) => i.sk.split("#")[1]));
    }

    if (method === "POST") {
      const body = JSON.parse(event.body || "{}");
      const { targetId, targetType, type, userKey } = body;
      // targetType: place | review | reply, type: like | dislike | bookmark
      if (!targetId || !targetType || !type || !userKey) return fail("필수 값이 누락되었습니다.");

      const sk = `${userKey}#${type}`;
      const { Item: existing } = await ddb.send(new GetCommand({
        TableName: REACTIONS, Key: { targetId, sk },
      }));

      let delta = 0;
      if (existing) {
        await ddb.send(new DeleteCommand({ TableName: REACTIONS, Key: { targetId, sk } }));
        delta = -1;
      } else {
        // like/dislike는 상호배타적으로 만들기(place 한정): 반대 반응 있으면 지움
        if (targetType === "place" && (type === "like" || type === "dislike")) {
          const opposite = type === "like" ? "dislike" : "like";
          const oppSk = `${userKey}#${opposite}`;
          const { Item: opp } = await ddb.send(new GetCommand({
            TableName: REACTIONS, Key: { targetId, sk: oppSk },
          }));
          if (opp) {
            await ddb.send(new DeleteCommand({ TableName: REACTIONS, Key: { targetId, sk: oppSk } }));
            await bumpCounter(targetType, targetId, opposite, -1);
          }
        }
        await ddb.send(new PutCommand({
          TableName: REACTIONS,
          Item: { targetId, sk, userKey, type, targetType, createdAt: new Date().toISOString() },
        }));
        delta = 1;
      }

      const newCount = await bumpCounter(targetType, targetId, type, delta);
      return ok({ targetId, type, active: delta === 1, count: newCount });
    }

    return fail("지원하지 않는 요청입니다.", 405);
  } catch (err) {
    console.error(err);
    return fail(err.message, 500);
  }
};

async function bumpCounter(targetType, targetId, type, delta) {
  const table = TABLE_BY_TYPE[targetType];
  const key = KEY_BY_TYPE[targetType];
  const field = targetType === "place" ? COUNTER_FIELD[type] : "likes"; // review/reply는 likes 필드 하나만 사용
  if (!table || !field) return null;
  const { Attributes } = await ddb.send(new UpdateCommand({
    TableName: table,
    Key: { [key]: targetId },
    UpdateExpression: `SET ${field} = if_not_exists(${field}, :zero) + :d`,
    ExpressionAttributeValues: { ":d": delta, ":zero": 0 },
    ReturnValues: "UPDATED_NEW",
  }));
  return Attributes?.[field] ?? null;
}