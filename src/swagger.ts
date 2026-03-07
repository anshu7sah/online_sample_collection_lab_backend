import swaggerJsDoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { Application } from "express";
import path from "path";

const swaggerOptions: swaggerJsDoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Online Sample Collection Lab API",
      version: "1.0.0",
      description: "API documentation for the Lab application backend",
    },
    servers: [
      {
        url: process.env.BASE_URL || "http://localhost:5000",
        description: process.env.NODE_ENV === "production" ? "Production Server" : "Development Server",
      },
    ],
  },
  // Ensure we pick up JSDoc comments in routes
  apis: [
    path.join(__dirname, "./routes/**/*.ts"),
  ],
};

const swaggerSpec = swaggerJsDoc(swaggerOptions);

export const setupSwagger = (app: Application) => {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  console.log("📄 Swagger documentation available at http://localhost:5000/api-docs");
};
