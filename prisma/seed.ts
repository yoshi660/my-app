// prisma/seed.ts - 開発用サンプルデータ投入スクリプト
// 実行: npx prisma db seed
// ※ index.ts と同じ接続方式（PrismaPg アダプタ + generated クライアント）に合わせてある
import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // 学部
  const rikou = await prisma.faculty.create({
    data: { name: "理工学部", department: "システムデザイン工学科" },
  });
  const keizai = await prisma.faculty.create({
    data: { name: "経済学部" },
  });

  // ユーザー（パスワードハッシュはログイン実装時に本物へ差し替え）
  const testUser = await prisma.user.create({
    data: {
      email: "test@keio.jp",
      passwordHash: "dummy_hash_replace_later",
      displayName: "テスト太郎",
      facultyId: rikou.id,
    },
  });

  // 授業
  const signal = await prisma.course.create({
    data: {
      name: "信号処理",
      facultyId: rikou.id,
      campus: "矢上",
      advice: "FFTの課題が重いので早めに着手推奨。教科書は毎回使います。",
    },
  });
  const complex = await prisma.course.create({
    data: {
      name: "複素解析",
      facultyId: rikou.id,
      campus: "矢上",
      advice: "留数定理まで進むと過去問演習が効く。ノート必須。",
    },
  });
  const micro = await prisma.course.create({
    data: {
      name: "ミクロ経済学",
      facultyId: keizai.id,
      campus: "日吉",
      advice: "中間・期末とも過去問と傾向が近い。",
    },
  });

  // 商品
  await prisma.item.createMany({
    data: [
      {
        sellerId: testUser.id,
        courseId: signal.id,
        title: "ディジタル信号処理の基礎",
        itemType: "textbook",
        price: 1500,
        condition: "good",
        description: "書き込み少なめ。矢上で手渡し可。",
      },
      {
        sellerId: testUser.id,
        courseId: complex.id,
        title: "複素解析 2025年度 過去問セット",
        itemType: "past_exam",
        price: 500,
        condition: "good",
        description: "中間・期末の2回分。略解つき。",
      },
      {
        sellerId: testUser.id,
        courseId: micro.id,
        title: "ミクロ経済学 講義ノート（前半）",
        itemType: "note",
        price: 300,
        condition: "used",
        description: "第1回〜第7回まで。",
      },
    ],
  });

  console.log("サンプルデータの投入が完了しました");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });