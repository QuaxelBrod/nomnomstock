"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRequestAuthContext = getRequestAuthContext;
const jwt_1 = require("next-auth/jwt");
const prisma_1 = require("./prisma");
function parsePositiveInt(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
async function buildAuthContext(token) {
    const email = typeof token?.email === 'string' ? token.email : null;
    const householdIdFromToken = parsePositiveInt(token?.householdId);
    const userId = parsePositiveInt(token?.sub);
    if (householdIdFromToken) {
        return { token, householdId: householdIdFromToken, userId, email };
    }
    if (!email) {
        return { token, householdId: null, userId, email: null };
    }
    const user = await prisma_1.prisma.user.findUnique({
        where: { email },
        select: { householdId: true },
    });
    return {
        token,
        householdId: user?.householdId ?? null,
        userId,
        email,
    };
}
async function getRequestAuthContext(request) {
    // @ts-ignore
    const token = await (0, jwt_1.getToken)({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token)
        return null;
    return buildAuthContext(token);
}
