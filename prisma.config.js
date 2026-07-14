export default {
  schema: "prisma/schema.prisma",
  datasource: {
    // 直接書かずに、その時々の住所（DATABASE_URL）を見るようにするのじゃ
    url: process.env.DATABASE_URL
  }
};
