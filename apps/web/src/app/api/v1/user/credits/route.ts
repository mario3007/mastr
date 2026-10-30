import { NextResponse } from 'next/server';
import type { UserCreditsResponse } from '@mastr/config';

export async function GET() {
  const response: UserCreditsResponse = {
    userId: 'user_anonymous',
    creditsRemaining: 2,
    tier: 'free',
  };

  return NextResponse.json(response);
}
