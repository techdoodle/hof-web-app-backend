import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Query, UploadedFile, UseInterceptors, ParseIntPipe } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { UserFilterDto, CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { AdminService } from './admin.service';
import { CreateMatchDto, UpdateMatchDto, MatchFilterDto } from './dto/match.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
    constructor(private readonly adminService: AdminService) { }

    // User Management - Admin and Super Admin only
    @Get('users')
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async getAllUsers(@Query() filters: UserFilterDto) {
        return this.adminService.getAllUsers(filters);
    }

    @Get('users/:id')
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async getUser(@Param('id', ParseIntPipe) id: number) {
        return this.adminService.getUser(id);
    }

    @Post('users')
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async createUser(@Body() createUserDto: CreateUserDto) {
        return this.adminService.createUser(createUserDto);
    }

    @Patch('users/:id')
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async updateUser(
        @Param('id', ParseIntPipe) id: number,
        @Body() updateUserDto: UpdateUserDto
    ) {
        return this.adminService.updateUser(id, updateUserDto);
    }

    @Delete('users/:id')
    @Roles(UserRole.SUPER_ADMIN) // Only super admin can delete users
    async deleteUser(@Param('id', ParseIntPipe) id: number) {
        return this.adminService.deleteUser(id);
    }

    // Match Management - Football Chief, Academy Admin, Admin, Super Admin
    @Get('matches')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async getAllMatches(@Query() filters: MatchFilterDto) {
        return this.adminService.getAllMatches(filters);
    }

    @Get('matches/:id')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async getMatch(@Param('id', ParseIntPipe) id: number) {
        return this.adminService.getMatch(id);
    }

    @Post('matches')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async createMatch(@Body() createMatchDto: CreateMatchDto) {
        return this.adminService.createMatch(createMatchDto);
    }

    @Patch('matches/:id')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async updateMatch(
        @Param('id', ParseIntPipe) id: number,
        @Body() updateMatchDto: UpdateMatchDto
    ) {
        return this.adminService.updateMatch(id, updateMatchDto);
    }

    @Delete('matches/:id')
    @Roles(UserRole.SUPER_ADMIN) // Only super admin can delete matches
    async deleteMatch(@Param('id', ParseIntPipe) id: number) {
        return this.adminService.deleteMatch(id);
    }

    // Match Participants Management
    @Get('match-participants')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async getAllMatchParticipants(@Query() query: any) {
        return this.adminService.getAllMatchParticipants(query);
    }

    @Get('matches/:id/participants')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async getMatchParticipants(@Param('id', ParseIntPipe) matchId: number) {
        return this.adminService.getMatchParticipants(matchId);
    }

    @Post('matches/:id/participants')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async addMatchParticipant(
        @Param('id', ParseIntPipe) matchId: number,
        @Body() participantData: any
    ) {
        return this.adminService.addMatchParticipant(matchId, participantData);
    }

    @Delete('matches/:matchId/participants/:userId')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async removeMatchParticipant(
        @Param('matchId', ParseIntPipe) matchId: number,
        @Param('userId', ParseIntPipe) userId: number
    ) {
        return this.adminService.removeMatchParticipant(matchId, userId);
    }

    // CSV Upload Preview - doesn't actually save to database
    @Post('matches/:id/preview-csv')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    @UseInterceptors(FileInterceptor('file'))
    async previewCsvUpload(
        @Param('id', ParseIntPipe) matchId: number,
        @UploadedFile() file: Express.Multer.File
    ) {
        return this.adminService.previewCsvUpload(file, matchId);
    }

    // Final CSV Upload - saves to database after admin review
    @Post('matches/:id/upload-stats')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async uploadMatchStats(
        @Param('id', ParseIntPipe) matchId: number,
        @Body() csvData: any[]
    ) {
        return this.adminService.uploadMatchStats(matchId, csvData);
    }

    // MVP Selection
    @Patch('matches/:id/mvp')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async setMatchMvp(
        @Param('id', ParseIntPipe) matchId: number,
        @Body() mvpData: { userId: number }
    ) {
        return this.adminService.setMatchMvp(matchId, mvpData.userId);
    }

    // Football Teams - reference data only (for user favorite teams)
    @Get('football-teams')
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN)
    async getFootballTeams(@Query() query: any) {
        return this.adminService.getFootballTeams(query);
    }

    // Cities - reference data only
    @Get('cities')
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN)
    async getCities(@Query() query: any) {
        return this.adminService.getCities(query);
    }

    // Venue Management
    @Get('venues')
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN)
    async getVenues(@Query() query: any) {
        return this.adminService.getVenues(query);
    }

    @Get('venues/:id')
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN)
    async getVenue(@Param('id', ParseIntPipe) id: number) {
        return this.adminService.getVenue(id);
    }

    @Post('venues')
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async createVenue(@Body() createVenueDto: any) {
        return this.adminService.createVenue(createVenueDto);
    }

    @Patch('venues/:id')
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async updateVenue(
        @Param('id', ParseIntPipe) id: number,
        @Body() updateVenueDto: any
    ) {
        return this.adminService.updateVenue(id, updateVenueDto);
    }

    @Delete('venues/:id')
    @Roles(UserRole.SUPER_ADMIN)
    async deleteVenue(@Param('id', ParseIntPipe) id: number) {
        return this.adminService.deleteVenue(id);
    }
}
