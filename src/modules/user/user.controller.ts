import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, UploadedFile, UseInterceptors, HttpException, HttpStatus, Req } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserService } from './user.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { ImageProcessingService } from './image-processing.service';

@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly imageProcessingService: ImageProcessingService
  ) {}

  @Post()
  create(@Body() data) {
    return this.userService.create(data);
  }

  @Get()
  findAll() {
    return this.userService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.userService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(@Param('id') id: number, @Body() data) {
    // This handles all user updates including gender, profile info, etc.
    console.log('PATCH /users/:id - Data keys:', Object.keys(data));
    console.log('PATCH /users/:id - Data lengths:', Object.keys(data).reduce((acc, key) => {
      acc[key] = typeof data[key] === 'string' ? data[key].length : 'not string';
      return acc;
    }, {}));
    return this.userService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: number) {
    return this.userService.remove(id);
  }

  // Separate endpoints for profile picture processing
  @Post('profile-picture/upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadAndProcessProfilePicture(@UploadedFile() file: Express.Multer.File, @Req() req) {
    if (!file) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    try {
      const userId = req.user?.userId; // Assuming JWT payload has userId
      if (!userId) {
        throw new HttpException('User ID not found in token', HttpStatus.UNAUTHORIZED);
      }

      const processedImageUrl = await this.imageProcessingService.processProfilePicture(file, userId);
      
      // Update user record with the new profile picture URL
      await this.userService.update(userId, { profilePicture: processedImageUrl });
      
      return { 
        success: true,
        url: processedImageUrl,
        message: 'Profile picture processed and uploaded successfully'
      };
    } catch (error) {
      throw new HttpException(
        `Failed to process profile picture: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('profile-picture/process-base64')
  @UseGuards(JwtAuthGuard)
  async processProfilePictureBase64(@Body() body: { imageData: string }, @Req() req) {
    if (!body.imageData) {
      throw new HttpException('No image data provided', HttpStatus.BAD_REQUEST);
    }

    try {
      const userId = req.user?.userId; // Assuming JWT payload has userId
      if (!userId) {
        throw new HttpException('User ID not found in token', HttpStatus.UNAUTHORIZED);
      }

      const processedImageUrl = await this.imageProcessingService.processProfilePictureBase64(body.imageData, userId);
      
      // Update user record with the new profile picture URL
      await this.userService.update(userId, { profilePicture: processedImageUrl });
      
      return { 
        success: true,
        url: processedImageUrl,
        message: 'Profile picture processed successfully'
      };
    } catch (error) {
      throw new HttpException(
        `Failed to process profile picture: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('profile-picture/process-only-base64')
  @UseGuards(JwtAuthGuard)
  async processOnlyProfilePictureBase64(@Body() body: { imageData: string }, @Req() req) {
    if (!body.imageData) {
      throw new HttpException('No image data provided', HttpStatus.BAD_REQUEST);
    }

    try {
      console.log('Request user:', req.user);
      console.log('Request body keys:', Object.keys(body));
      
      const userId = req.user?.userId; // Assuming JWT payload has userId
      if (!userId) {
        console.log('No userId found in req.user:', req.user);
        throw new HttpException('User ID not found in token', HttpStatus.UNAUTHORIZED);
      }

      console.log('Processing image for userId:', userId);
      const processedImageUrl = await this.imageProcessingService.processProfilePictureBase64(body.imageData, userId);
      
      return { 
        success: true,
        url: processedImageUrl,
        message: 'Profile picture processed successfully (not saved to profile)'
      };
    } catch (error) {
      console.error('Profile picture processing error:', error);
      throw new HttpException(
        `Failed to process profile picture: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('profile-picture/extract-face')
  @UseGuards(JwtAuthGuard)
  async extractFaceFromImage(@Body() body: { imageData: string }, @Req() req) {
    if (!body.imageData) {
      throw new HttpException('No image data provided', HttpStatus.BAD_REQUEST);
    }

    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new HttpException('User ID not found in token', HttpStatus.UNAUTHORIZED);
      }

      const faceImageUrl = await this.imageProcessingService.extractFaceFromBase64(body.imageData, userId);
      
      return { 
        success: true,
        url: faceImageUrl,
        message: 'Face extracted successfully'
      };
    } catch (error) {
      console.error('Face extraction error:', error);
      throw new HttpException(
        `Failed to extract face: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
