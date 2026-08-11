import { NextResponse } from 'next/server';
import { recordSpamTrainingSample } from '@/lib/ai/spam-classifier';
import { prisma } from '@/lib/db/prisma';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { emailId, subject, snippet, fromAddress, label } = body;

    if (!label || (label !== 'spam' && label !== 'ham')) {
      return NextResponse.json(
        { error: 'Valid label ("spam" or "ham") is required' },
        { status: 400 }
      );
    }

    // 1. Online continuous learning: update token and domain weights
    const { sample, updatedStats } = recordSpamTrainingSample({
      emailId,
      subject,
      snippet,
      fromAddress,
      label,
    });

    // 2. If emailId provided, update email status in database
    if (emailId) {
      try {
        await prisma.email.updateMany({
          where: { id: emailId },
          data: {
            isHighRisk: label === 'spam',
            riskReason: label === 'spam' ? 'Flagged as definite spam by user feedback' : null,
          },
        });
      } catch (dbErr) {
        console.warn('Could not update email isHighRisk in DB:', dbErr);
      }
    }

    return NextResponse.json({
      success: true,
      label,
      sample,
      updatedStats,
      message: label === 'spam' ? 'Trained model: Marked as definite spam' : 'Trained model: Marked as safe (ham)',
    });
  } catch (err: any) {
    console.error('Spam Label Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to record spam label' }, { status: 500 });
  }
}
