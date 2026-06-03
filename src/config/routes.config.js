import express from "express";
import createError from "http-errors";

const router = express.Router();

router.get('/', (req, res) => res.json({ health: 'ok' }));


export default router;
