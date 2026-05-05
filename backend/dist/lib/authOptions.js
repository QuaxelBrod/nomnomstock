"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authOptions = void 0;
const credentials_1 = __importDefault(require("next-auth/providers/credentials"));
const prisma_adapter_1 = require("@next-auth/prisma-adapter");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = require("./prisma");
exports.authOptions = {
    adapter: (0, prisma_adapter_1.PrismaAdapter)(prisma_1.prisma),
    providers: [
        (0, credentials_1.default)({
            name: 'Credentials',
            credentials: {
                email: { label: 'Email', type: 'text' },
                password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials) {
                try {
                    const fs = await Promise.resolve().then(() => __importStar(require('fs')));
                    fs.appendFileSync('/tmp/nextauth-authorize.log', `[${new Date().toISOString()}] authorize ${JSON.stringify({ email: credentials?.email })}\n`);
                }
                catch { }
                console.log('[nextauth] authorize', { email: credentials?.email });
                if (!credentials?.email || !credentials?.password) {
                    try {
                        const fs = await Promise.resolve().then(() => __importStar(require('fs')));
                        fs.appendFileSync('/tmp/nextauth-authorize.log', `[${new Date().toISOString()}] missing credentials\n`);
                    }
                    catch { }
                    console.log('[nextauth] missing credentials');
                    return null;
                }
                try {
                    await (await Promise.resolve().then(() => __importStar(require('./dbFixes')))).ensurePasswordColumn();
                }
                catch { }
                const user = await prisma_1.prisma.user.findUnique({ where: { email: credentials.email } });
                try {
                    const fs = await Promise.resolve().then(() => __importStar(require('fs')));
                    fs.appendFileSync('/tmp/nextauth-authorize.log', `[${new Date().toISOString()}] found user=${!!user}\n`);
                }
                catch { }
                console.log('[nextauth] found user', !!user);
                if (!user)
                    return null;
                if (!user.isActive) {
                    try {
                        const fs = await Promise.resolve().then(() => __importStar(require('fs')));
                        fs.appendFileSync('/tmp/nextauth-authorize.log', `[${new Date().toISOString()}] user not active\n`);
                    }
                    catch { }
                    console.log('[nextauth] user not active');
                    return null;
                }
                const hash = user.password;
                if (!hash) {
                    try {
                        const fs = await Promise.resolve().then(() => __importStar(require('fs')));
                        fs.appendFileSync('/tmp/nextauth-authorize.log', `[${new Date().toISOString()}] no password hash\n`);
                    }
                    catch { }
                    console.log('[nextauth] no password hash on user');
                    return null;
                }
                const valid = await bcryptjs_1.default.compare(credentials.password, hash);
                if (!valid) {
                    try {
                        const fs = await Promise.resolve().then(() => __importStar(require('fs')));
                        fs.appendFileSync('/tmp/nextauth-authorize.log', `[${new Date().toISOString()}] invalid password\n`);
                    }
                    catch { }
                    console.log('[nextauth] invalid password');
                    return null;
                }
                return {
                    id: user.id.toString(),
                    email: user.email,
                    name: user.name,
                    role: user.role,
                    householdId: user.householdId,
                };
            },
        }),
    ],
    session: { strategy: 'jwt' },
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                // @ts-ignore
                token.role = user.role || 'USER';
                // @ts-ignore
                token.householdId = user.householdId;
            }
            return token;
        },
        async session({ session, token }) {
            // @ts-ignore
            session.user = session.user || {};
            // @ts-ignore
            session.user.role = token.role;
            // @ts-ignore
            session.user.householdId = token.householdId;
            return session;
        },
    },
    secret: process.env.NEXTAUTH_SECRET,
};
