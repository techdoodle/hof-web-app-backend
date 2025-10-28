import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Query, UploadedFile, UseInterceptors, ParseIntPipe } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { UserFilterDto, CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { AdminService } from './admin.service';
import { CreateMatchDto, UpdateMatchDto, MatchFilterDto } from './dto/match.dto';
import { PlayerNationSubmitDto } from './dto/playernation-submit.dto';
import { SaveMappingsDto } from './dto/playernation-mapping.dto';
import { PlayerNationService } from './services/playernation.service';
import { FirebaseStorageService } from '../user/firebase-storage.service';
import { PlayerNationPlayerMapping } from './entities/playernation-player-mapping.entity';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
    constructor(
        private readonly adminService: AdminService,
        private readonly playerNationService: PlayerNationService,
        private readonly firebaseStorageService: FirebaseStorageService,
    ) { }

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

    // Match Types
    @Get('match_types')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async getMatchTypes(@Query() query: any) {
        console.log('inside getMatchTypes', query);
        return this.adminService.getMatchTypes(query);
    }

    @Get('match_types/:id')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async getMatchType(@Param('id', ParseIntPipe) id: number) {
        console.log('inside getMatchType', id);
        return this.adminService.getMatchType(id);
    }

    // PlayerNation Integration - Football Chief, Academy Admin, Admin, Super Admin
    @Post('playernation/submit/:matchId')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async submitToPlayerNation(
        @Param('matchId', ParseIntPipe) matchId: number,
        @Body() payload: PlayerNationSubmitDto
    ) {
        console.log('=== PLAYERNATION SUBMIT ===', { 
            matchId, 
            teamAPlayerCount: payload.players?.teamA?.length || 0,
            teamBPlayerCount: payload.players?.teamB?.length || 0,
            totalPlayerCount: (payload.players?.teamA?.length || 0) + (payload.players?.teamB?.length || 0)
        });
        
        try {
            const result = await this.playerNationService.submitMatch(matchId, payload);
            console.log('PlayerNation submit success:', result);
            return result;
        } catch (error) {
            console.error('PlayerNation submit error:', error.message);
            throw error;
        }
    }

    @Get('playernation/status/:matchId')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async getPlayerNationStatus(@Param('matchId', ParseIntPipe) matchId: number) {
        return this.playerNationService.getMatchStatus(matchId);
    }

    @Post('playernation/poll-now/:matchId')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async pollNow(@Param('matchId', ParseIntPipe) matchId: number) {
        await this.playerNationService.pollMatchStats(matchId);
        return { message: 'Poll initiated successfully' };
    }

    @Get('playernation/unmapped/:matchId')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async getUnmappedPlayers(@Param('matchId', ParseIntPipe) matchId: number): Promise<PlayerNationPlayerMapping[]> {
        return this.playerNationService.getUnmappedPlayers(matchId);
    }

    @Post('playernation/save-mappings/:matchId')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async saveMappings(
        @Param('matchId', ParseIntPipe) matchId: number,
        @Body() mappings: SaveMappingsDto['mappings']
    ) {
        await this.playerNationService.saveMappings(matchId, mappings);
        return { message: 'Mappings saved successfully' };
    }

    @Post('playernation/signed-url')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async getSignedUploadUrl(@Body() body: { fileName: string; contentType: string }) {
        const { uploadUrl, downloadUrl } = await this.firebaseStorageService.generateSignedUploadUrl(
            body.fileName,
            body.contentType
        );
        
        return {
            uploadUrl,
            downloadUrl,
            fileName: body.fileName,
            contentType: body.contentType
        };
    }

    @Post('playernation/upload-video')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async uploadVideo(@Body() body: { fileName: string; contentType: string; base64Data: string; participantId: number; matchId: number }) {
        try {
            // Convert base64 to buffer
            const buffer = Buffer.from(body.base64Data, 'base64');
            
            // Upload to Firebase Storage
            const downloadUrl = await this.firebaseStorageService.uploadPlayerNationVideo(
                body.fileName,
                buffer,
                body.contentType
            );
            
            // Save video URL to database
            await this.adminService.updateParticipantVideoUrl(body.participantId, body.matchId, downloadUrl);
            
            return {
                downloadUrl,
                fileName: body.fileName,
                contentType: body.contentType
            };
        } catch (error) {
            console.error('Video upload error:', error);
            throw new Error('Failed to upload video');
        }
    }

    @Post('playernation/clear-video')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async clearVideo(@Body() body: { participantId: number; matchId: number }) {
        try {
            await this.adminService.updateParticipantVideoUrl(body.participantId, body.matchId, null);
            return { message: 'Video cleared successfully' };
        } catch (error) {
            console.error('Clear video error:', error);
            throw new Error('Failed to clear video');
        }
    }

    @Get('test')
    async testEndpoint() {
        return { message: 'Test endpoint working' };
    }

    @Get('public-test')
    @UseGuards() // No guards for this endpoint
    async publicTestEndpoint() {
        return { 
            message: 'Public test endpoint working',
            timestamp: new Date().toISOString(),
            playerNationServiceAvailable: !!this.playerNationService
        };
    }

    @Get('playernation/test')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async testPlayerNation() {
        console.log('=== PLAYERNATION TEST ENDPOINT CALLED ===');
        console.log('PlayerNationService available:', !!this.playerNationService);
        
        try {
            const token = await this.playerNationService.getValidToken();
            return { 
                message: 'PlayerNation service working', 
                tokenLength: token ? token.length : 0,
                hasToken: !!token
            };
        } catch (error) {
            console.error('PlayerNation test error:', error);
            return { 
                message: 'PlayerNation service error', 
                error: error.message 
            };
        }
    }
}
