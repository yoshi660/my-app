import "dotenv/config";
import express from "express";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

// 本番でもローカルでも DATABASE_URL を使うようにしておくぞ
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter, log: ["query"] });

const app = express();
const PORT = process.env.PORT || 8888;

app.set("view engine", "ejs");
app.set("views", "./views");
app.use(express.urlencoded({ extended: true }));

// ブラウザで開いたとき（GETリクエスト）の処理
app.get("/", async (req, res) => {
  const users = await prisma.user.findMany();
  res.render("index", { users });
});

// フォームで送信したとき（POSTリクエスト）の処理
app.post("/users", async (req, res) => {
  const { name, age } = req.body;
  if (name) {
    await prisma.user.create({ 
      data: { 
        name, 
        age: age ? parseInt(age) : null 
      } 
    });
  }
  res.redirect("/");
});

// サーバーを起動し、ずっと待ち構えるようにするのじゃ
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
