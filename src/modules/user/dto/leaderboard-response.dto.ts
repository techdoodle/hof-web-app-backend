export class LeaderboardUserDto {
  id: number;
  rank: number;
  name: string;
  score: number;
  suffix: string;
  imageUrl: string;
  userId: number;
}

export class LeaderboardPaginationDto {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  hasNextPage: boolean;
}

export class LeaderboardResponseDto {
  data: LeaderboardUserDto[];
  pagination: LeaderboardPaginationDto;
}

