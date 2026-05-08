import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import mongoose from "mongoose";
import jwt from "jsonwebtoken"


// access & Refresh token Generation
const generateAccessAndRefreshTokens = async(userId) => {
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave: false })
    
        return {accessToken, refreshToken}
    } catch (error) {
        // throw new ApiError(500, "Something Went Wrong While Generating Refresh & Access Token")
        throw new ApiError(500, error)
    }
    
}

console.log(generateAccessAndRefreshTokens)


const registerUser = asyncHandler(async (req, res) => {
  //get user details from user
  const { fullName, email, username, password } = req.body;

  //Validation Not empty
  if (
    [fullName, email, username, password].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "Full Name is Required");
  }

  // check if user is already exist by username & email
  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
  });
  if (existedUser) {
    throw new ApiError(409, "User with Email & Username already exists!");
  }
  console.log(req.files?.avatar[0]?.path);
  //check for images, check for avatar & cover Images
  const avatarLocalPath = req.files?.avatar[0]?.path;

  const coverImageLocatlPath = req.files?.coverImage[0]?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is required");
  }

  // upload them to cloudinary, avatar
  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverImage = await uploadOnCloudinary(coverImageLocatlPath);

  if (!avatar) {
    throw new ApiError(400, "Avatar File is required!");
  }

  // create user object create entry in db

  const user = await User.create({
    fullName,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
    email,
    password,
    username: username.toLowerCase(),
  });

  //remove password & refresh token field from response
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  //check for user creation
  if (!createdUser) {
    throw new ApiError(500, "Something Wrong while registering the user");
  }

  //return res

  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User Registered Successfully!"));
});

const loginUser = asyncHandler(async (req, res) => {
  
    // Get Username/email, password
  const { email, username, password } = req.body

  // Validate username & email from server

  if (!email && !username) {
    throw new ApiError(400, "username or password is required");
  }
  
  // Find the user
  const user = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (!user) {
    throw new ApiError(404, "User does not exist!");
  }

  // Check password
  const isPasswordValid = await user.isPasswordCorrect(password)  

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid User Credentials");
  }
    
 const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(user._id)
  
  const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

  // send cookie

  const options = {
    httpOnly: true,
    secure: true
  }

  return res.status(200)
  .cookie("accessToken", accessToken, options)
  .cookie("refreshToken", refreshToken, options)
  .json(
    new ApiResponse(200, {
        user: loggedInUser, accessToken, refreshToken
    },
    "User logged in successfully"
)
  )

});

const logoutUser = asyncHandler(async(req, res)=> {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: undefined
            }
        },
        {
            new: true
        }
    )
        const options ={
            httpOnly: true,
            secure: true
        }
        return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse(200, {}, "User Logged Out!"))



})

const refreshAccessToken = asyncHandler(async(req, res) => {
   const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

   if (!incomingRefreshToken) {
      throw new ApiError(401, "Unauthorized Request")
   }

   try {
       const decodedToken = jwt.verify(
    incomingRefreshToken,
    process.env.REFRESH_TOKEN_SECRET
   )

   const user = User.findById(decodedToken?._id)
   if (!user) {
      throw new ApiError(401, "Invalid Refresh Token")
   }

   if (incomingRefreshToken !== user?.refreshToken ) {
    throw new ApiError(401, "Refresh token is expired & used");
   }

   const options = {
    httpOnly: true,
    secure: true
   }
   const {accessToken, newRefreshToken} = await
   await generateAccessAndRefreshTokens(user._id)

   return res
   .status(200)
   .cookie("accessToken", accessToken, options)
   .cookie("refreshToken", newRefreshToken, options)
   .json(
    new ApiResponse(
      200, 
      {accessToken, refreshToken: newRefreshToken},
      "Access Token Refreshed"
    )
   )
   } catch (error) {
    throw new ApiError(401, error?.message || "Invalid Refresh Token");
    
   }

  })


  const changeCurrentPassword = asyncHandler(async(req, res) => {
    const {oldPassword, newPassword} = req.body

    const user = await User.findById(req.user?._id)
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)
    
    if (!isPasswordCorrect) {
      throw new ApiError(400, 'Invalid Old Password')
    }

    user.password = newPassword
    await user.save({validateBeforeSave: false})

    return res
    .status(200)
    .json(
      new ApiResponse(200,  {}, "Password Changed Successfully"
    ))
  })

  const getCurrentUser = asyncHandler(async(req,res) => {
    return res
    .status(200)  
    .json(200, req.user, "Current user fetched successfully")
  })


  const updateAccountDetails = asyncHandler(async(req, res)=>{
    const {fullName, email} = req.body
    if (!(fullName || email)) {
      throw new ApiError(400,"All fields are required");
      
    }

    const user = User.findByIdAndUpdate(req.user?._id,
      {
        $set:{
          fullName,
          email: email
        }
      },
      {new: true}
    ).select("-password")

    res
    .status(200)
    .json(new ApiResponse(200, user, "Account Details Updated Successfully"))
  })


  const updateUserAvatar = asyncHandler(async(req, res) => {
    const avatarLocalPath = req.file?.path
    if (!avatarLocalPath) {
      throw new ApiError(400, "Avatar file is required!");  
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)

    if (!avatar.url) {
      throw new Error(400, "Error While Uploading Avatar");
    }

     const user = await User.findByIdAndUpdate(req.user?._id,
      {
        $set:{
          avatar: avatar.url
        }
      },
      {new: true}
    ).select("-password")
    
  })
 
  const updateUserCoverImage = asyncHandler(async(req, res) => {
    const coverLocalPath = req.file?.path
    if (!coverLocalPath) {
      throw new ApiError(400, "Cover Image file is missing!");  
    }

    const coverImage = await uploadOnCloudinary(coverLocalPath)

    if (!coverImage.url) {
      throw new Error(400, "Error While Uploading Cover Image");
    }

     await User.findByIdAndUpdate(req.user?._id,
      {
        $set:{
          coverImage: coverImage.url
        }
      },
      {new: true}
    ).select("-password")
    
  })


export { registerUser, loginUser, logoutUser, refreshAccessToken, changeCurrentPassword, getCurrentUser, updateAccountDetails, updateUserAvatar, updateUserCoverImage };
