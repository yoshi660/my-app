import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

// PostgreSQL に接続するための準備じゃ
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter, log: ["query"] });

async function main() {
  console.log("データベースに接続中...");
  
  // ユーザーを 1 件追加してみるぞ
  const newUser = await prisma.user.create({
    data: { name: `ユーザー ${new Date().toLocaleTimeString()}` },
  });
  console.log("追加したユーザー:", newUser);

  // 全員の一覧を取得して表示する
  const users = await prisma.user.findMany();
  console.log("現在の全ユーザー:", users);
}

main()
  .catch((e) => { 
    console.error("エラーが発生したぞ:", e); 
    process.exit(1); 
  })
  .finally(async () => {
    // 接続をきれいに閉じるのを忘れずにな
    await prisma.$disconnect();
    await pool.end();
  });
