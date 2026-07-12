import { GetCommand, PutCommand, ScanCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import crypto from "node:crypto";
import { ddb } from "../common/dynamo.mjs";
import { ok, fail } from "../common/response.mjs";

const TABLE = process.env.PLACES_TABLE;

export const handler = async (event) => {
  const method = event.requestContext.http.method;
  const { placeId } = event.pathParameters || {};

  try {
    if (method === "GET" && !placeId) {
      const { Items } = await ddb.send(new ScanCommand({ TableName: TABLE }));
      return ok(Items || []);
    }

    if (method === "GET" && placeId) {
      const { Item } = await ddb.send(new GetCommand({ TableName: TABLE, Key: { placeId } }));
      if (!Item) return fail("장소를 찾을 수 없습니다.", 404);
      return ok(Item);
    }

    if (method === "POST") {
      const body = JSON.parse(event.body || "{}");
      const item = {
        placeId: crypto.randomUUID(),
        name: body.name,
        address: body.address,
        lat: body.lat,
        lng: body.lng,
        category: body.category || null,
        petZone: body.petZone || null,
        largeDog: body.largeDog ?? null,
        petMenu: body.petMenu || null,
        hours: body.hours || null,
        phone: body.phone || null,
        memo: body.memo || null,
        imageUrl: body.imageUrl || null,
        galleryImages: body.galleryImages || [],
        likeCount: 0,
        dislikeCount: 0,
        bookmarkCount: 0,
        createdAt: new Date().toISOString(),
      };
      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
      return ok(item, 201);
    }

    if (method === "PUT" && placeId) {
      const body = JSON.parse(event.body || "{}");
      const keys = Object.keys(body);
      if (!keys.length) return fail("수정할 필드가 없습니다.");
      const ExpressionAttributeNames = {};
      const ExpressionAttributeValues = {};
      const sets = keys.map((k, i) => {
        ExpressionAttributeNames[`#f${i}`] = k;
        ExpressionAttributeValues[`:v${i}`] = body[k];
        return `#f${i} = :v${i}`;
      });
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { placeId },
        UpdateExpression: "SET " + sets.join(", "),
        ExpressionAttributeNames,
        ExpressionAttributeValues,
      }));
      return ok({ placeId, updated: keys });
    }

    if (method === "DELETE" && placeId) {
      await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { placeId } }));
      return ok({ deleted: placeId });
    }

    return fail("지원하지 않는 요청입니다.", 405);
  } catch (err) {
    console.error(err);
    return fail(err.message, 500);
  }
};