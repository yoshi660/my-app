import "dotenv/config";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import session from "express-session";
import bcrypt from "bcryptjs";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, ItemType } from "./generated/prisma/client";

// セッションに保存するデータの型を拡張
declare module "express-session" {
  interface SessionData {
    userId?: number;
    displayName?: string;
  }
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const app = express();
const PORT = process.env.PORT || 8888;

app.set("view engine", "ejs");
app.set("views", "./views");
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// ---------- セッション設定 ----------
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }, // 7日間
  })
);

// 全テンプレートから currentUser を参照できるようにする
app.use((req: Request, res: Response, next: NextFunction) => {
  res.locals.currentUser = req.session.userId
    ? { id: req.session.userId, displayName: req.session.displayName }
    : null;
  next();
});

// ログイン必須ページ用ミドルウェア
function requireLogin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.redirect("/login");
  }
  next();
}

const VALID_TYPES = ["textbook", "past_exam", "note"];

// ==================================================
// 商品一覧（トップページ、検索つき）
// ==================================================
app.get("/", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const type = typeof req.query.type === "string" ? req.query.type : "";

  const items = await prisma.item.findMany({
    where: {
      status: "on_sale",
      ...(q !== ""
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { course: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
      ...(VALID_TYPES.includes(type) ? { itemType: type as ItemType } : {}),
    },
    include: { course: { include: { faculty: true } } },
    orderBy: { createdAt: "desc" },
  });

  const courses = await prisma.course.findMany({ orderBy: { name: "asc" } });

  res.render("index", { items, courses, q, type });
});

// ==================================================
// 商品詳細
// ==================================================
app.get("/items/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.redirect("/");

  const item = await prisma.item.findUnique({
    where: { id },
    include: {
      course: { include: { faculty: true } },
      seller: true,
    },
  });

  if (!item) return res.status(404).send("商品が見つかりません");
  res.render("item", { item });
});

// ==================================================
// 出品（ログイン必須。出品者 = ログイン中のユーザー）
// ==================================================
app.post("/items", requireLogin, async (req, res) => {
  const { title, item_type, price, course_id, condition, description } = req.body;

  if (!title || !VALID_TYPES.includes(item_type) || !price || parseInt(price) < 0) {
    return res.redirect("/");
  }

  await prisma.item.create({
    data: {
      title,
      itemType: item_type as ItemType,
      price: parseInt(price),
      courseId: course_id ? parseInt(course_id) : null,
      condition: condition || null,
      description: description || null,
      sellerId: req.session.userId!,
    },
  });

  res.redirect("/");
});

// ==================================================
// 購入（ログイン必須）
// ==================================================
app.post("/items/:id/purchase", requireLogin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.redirect("/");

  const item = await prisma.item.findUnique({ where: { id } });

  // ガード：存在しない / 売切 / 自分の出品 は購入不可
  if (!item) return res.status(404).send("商品が見つかりません");
  if (item.status !== "on_sale") return res.status(409).send("この商品はすでに売り切れです");
  if (item.sellerId === req.session.userId) {
    return res.status(400).send("自分の出品は購入できません");
  }

  // 取引の作成と商品ステータスの更新を同一トランザクションで行う
  await prisma.$transaction([
    prisma.transaction.create({
      data: { itemId: id, buyerId: req.session.userId! },
    }),
    prisma.item.update({
      where: { id },
      data: { status: "sold" },
    }),
  ]);

  res.redirect("/mypage");
});

// ==================================================
// 会員登録（デモ版のためメールドメイン制限なし）
// ==================================================
app.get("/signup", (req, res) => {
  res.render("signup", { error: null });
});

app.post("/signup", async (req, res) => {
  const { email, password, display_name } = req.body;

  if (!email || !password || !display_name) {
    return res.render("signup", { error: "すべての項目を入力してください" });
  }
  if (password.length < 6) {
    return res.render("signup", { error: "パスワードは6文字以上にしてください" });
  }

  // メールアドレスの重複チェック
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.render("signup", { error: "このメールアドレスは登録済みです" });
  }

  // パスワードは bcrypt でハッシュ化して保存（平文では絶対に保存しない）
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, passwordHash, displayName: display_name },
  });

  // 登録後そのままログイン状態にする
  req.session.userId = user.id;
  req.session.displayName = user.displayName;
  res.redirect("/");
});

// ==================================================
// ログイン / ログアウト
// ==================================================
app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  // ユーザーが存在しない場合もパスワード不一致と同じメッセージにする
  // （「どちらが間違っているか」を攻撃者に教えないため）
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.render("login", { error: "メールアドレスまたはパスワードが正しくありません" });
  }

  req.session.userId = user.id;
  req.session.displayName = user.displayName;
  res.redirect("/");
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

// ==================================================
// マイページ（出品一覧 + 購入履歴）
// ==================================================
app.get("/mypage", requireLogin, async (req, res) => {
  const userId = req.session.userId!;

  const myItems = await prisma.item.findMany({
    where: { sellerId: userId },
    include: { course: true },
    orderBy: { createdAt: "desc" },
  });

  const myPurchases = await prisma.transaction.findMany({
    where: { buyerId: userId },
    include: { item: { include: { course: true, seller: true } } },
    orderBy: { createdAt: "desc" },
  });

  res.render("mypage", { myItems, myPurchases });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
