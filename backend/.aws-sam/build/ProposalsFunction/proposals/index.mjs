import { PutCommand, QueryCommand, UpdateCommand, DeleteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import crypto from "node:crypto";
import { ddb } from "../common/dynamo.mjs";
import { ok, fail } from "../common/response.mjs";

const PROPOSALS = process.env.PROPOSALS_TABLE;
const PLACES = process.env.PLACES_TABLE;

export const handler = async (event) => {
  const method = event.requestContext.http.method;
  const { proposalId } = event.pathParameters || {};
  const isApprove = event.rawPath?.endsWith("/approve");

  try {
    if (method === "GET") {
      const status = event.queryStringParameters?.status || "pending";
      const { Items } = await ddb.send(new QueryCommand({
        TableName: PROPOSALS,
        IndexName: "status-index",
        KeyConditionExpression: "#s = :s",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":s": status },
        ScanIndexForward: false,
      }));
      return ok(Items || []);
    }

    if (method === "POST" && !proposalId) {
      const body = JSON.parse(event.body || "{}");
      const item = {
        proposalId: crypto.randomUUID(),
        placeName: body.placeName,
        address: body.address,
        category: body.category || null,
        petZone: body.petZone || null,
        largeDog: body.largeDog ?? null,
        petMenu: body.petMenu || null,
        hours: body.hours || null,
        phone: body.phone || null,
        memo: body.memo || null,
        imageUrls: body.imageUrls || [],
        reporterKey: body.reporterKey || null,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      await ddb.send(new PutCommand({ TableName: PROPOSALS, Item: item }));
      return ok(item, 201);
    }

    // 관리자: 승인 → Places 테이블에 실제 등록 + proposal 상태 변경
    if (method === "POST" && proposalId && isApprove) {
      const { Item: proposal } = await ddb.send(new GetCommand({ TableName: PROPOSALS, Key: { proposalId } }));
      if (!proposal) return fail("제보를 찾을 수 없습니다.", 404);

      const placeItem = {
        placeId: uuid(),
        name: proposal.placeName,
        address: proposal.address,
        lat: proposal.lat || null,
        lng: proposal.lng || null,
        category: proposal.category,
        petZone: proposal.petZone,
        largeDog: proposal.largeDog,
        petMenu: proposal.petMenu,
        hours: proposal.hours,
        phone: proposal.phone,
        memo: proposal.memo,
        imageUrl: proposal.imageUrls?.[0] || null,
        galleryImages: proposal.imageUrls?.slice(1) || [],
        likeCount: 0, dislikeCount: 0, bookmarkCount: 0,
        createdAt: new Date().toISOString(),
      };
      await ddb.send(new PutCommand({ TableName: PLACES, Item: placeItem }));
      await ddb.send(new UpdateCommand({
        TableName: PROPOSALS,
        Key: { proposalId },
        UpdateExpression: "SET #s = :s",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":s": "approved" },
      }));
      return ok({ approved: proposalId, newPlaceId: placeItem.placeId });
    }

    if (method === "PUT" && proposalId) {
      const body = JSON.parse(event.body || "{}"); // { status: "on_hold" } 등 필드 수정
      const keys = Object.keys(body);
      const ExpressionAttributeNames = {};
      const ExpressionAttributeValues = {};
      const sets = keys.map((k, i) => {
        ExpressionAttributeNames[`#f${i}`] = k;
        ExpressionAttributeValues[`:v${i}`] = body[k];
        return `#f${i} = :v${i}`;
      });
      await ddb.send(new UpdateCommand({
        TableName: PROPOSALS,
        Key: { proposalId },
        UpdateExpression: "SET " + sets.join(", "),
        ExpressionAttributeNames,
        ExpressionAttributeValues,
      }));
      return ok({ proposalId, updated: keys });
    }

    if (method === "DELETE" && proposalId) {
      await ddb.send(new DeleteCommand({ TableName: PROPOSALS, Key: { proposalId } }));
      return ok({ deleted: proposalId });
    }

    return fail("지원하지 않는 요청입니다.", 405);
  } catch (err) {
    console.error(err);
    return fail(err.message, 500);
  }
};