import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'This endpoint is disabled. Use the canonical Microsoft OAuth /init and /callback flow.' },
    { status: 410 }
  );
}
