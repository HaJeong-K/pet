import { PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import crypto from "node:crypto";
import { ddb } from "../common/dynamo.mjs";
import { ok, fail } from "../common/response.mjs";

const REPORTS = process.env.REPORTS_TABLE;
const REVIEWS = process.env.REVIEWS_TABLE;
const REPLIES = process.env.REPLIES_TABLE;

export const handler = async (event) => {
  const method = event.requestContext.http.method;
  const { reportId } = event.pathParameters || {};

  try {
    if (method === "GET") {
      const isResolved = event.queryStringParameters?.resolved === "true" ? "true" : "false";
      const { Items } = await ddb.send(new QueryCommand({
        TableName: REPORTS,
        IndexName: "resolved-index",
        KeyConditionExpression: "isResolved = :r",
        ExpressionAttributeValues: { ":r": isResolved },
        ScanIndexForward: false,
      }));
      return ok(Items || []);
    }

    if (method === "POST") {
      const body = JSON.parse(event.body || "{}");
      const item = {
        reportId: crypto.randomUUID(),
        type: body.type,           // review | reply | place
        targetId: body.targetId || null,
        placeId: body.placeId || null,
        reporterKey: body.reporterKey || null,
        reportCategory: body.reportCategory,
        reportReason: body.reportReason,
        isResolved: "false",
        createdAt: new Date().toISOString(),
      };
      await ddb.send(new PutCommand({ TableName: REPORTS, Item: item }));
      return ok(item, 201);
    }

    // 관리자: 처리완료 + (선택) 원본 콘텐츠 삭제
    if (method === "PUT" && reportId) {
      const body = JSON.parse(event.body || "{}"); // { deleteContent: true } 옵션
      await ddb.send(new UpdateCommand({
        TableName: REPORTS,
        Key: { reportId },
        UpdateExpression: "SET isResolved = :t",
        ExpressionAttributeValues: { ":t": "true" },
      }));

      if (body.deleteContent && body.type && body.targetId) {
        const table = body.type === "review" ? REVIEWS : REPLIES;
        const key = body.type === "review" ? "reviewId" : "replyId";
        await ddb.send(new UpdateCommand({
          TableName: table,
          Key: { [key]: body.targetId },
          UpdateExpression: "SET isAdminDeleted = :t, content = :c",
          ExpressionAttributeValues: {
            ":t": true,
            ":c": "부적절한 내용으로 관리자에 의해 삭제되었습니다.",
          },
        }));
      }
      return ok({ resolved: reportId });
    }

    return fail("지원하지 않는 요청입니다.", 405);
  } catch (err) {
    console.error(err);
    return fail(err.message, 500);
  }
};