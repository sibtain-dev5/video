import dotenv from "dotenv";
import connectDB from "./db/index.js";
import express from "express";
import {app} from "./app.js"


dotenv.config({
  path: "./.env",
});

connectDB()
.then( () => {
try{

  app.listen(process.env.PORT || 8000, () => {
    console.log(`Server is runing at port: ${process.env.PORT}`);
  })
} catch(err){
  throw err;
}
})
.catch( (err) => {
    console.log("Mongodb connection failed!", err)
})
