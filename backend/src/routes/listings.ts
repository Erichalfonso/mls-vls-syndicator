// Listing routes - Upload and manage property listings

import express from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import multer from 'multer';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

const router = express.Router();
const prisma = new PrismaClient();

// All routes require authentication
router.use(authenticateToken);

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// POST /api/listings/upload - Upload CSV/Excel file with listings
router.post('/upload', upload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const workflowId = req.body.workflowId ? parseInt(req.body.workflowId) : null;

    // Verify workflow ownership if provided
    if (workflowId) {
      const workflow = await prisma.workflow.findFirst({
        where: {
          id: workflowId,
          userId: req.userId
        }
      });

      if (!workflow) {
        return res.status(404).json({
          success: false,
          error: 'Workflow not found'
        });
      }

      if (workflow.status !== 'ready' && workflow.status !== 'active') {
        return res.status(400).json({
          success: false,
          error: 'Workflow is not ready for use. Complete AI learning phase first.'
        });
      }
    }

    // Parse file based on type
    let listingData: any[] = [];
    const fileExtension = req.file.originalname.split('.').pop()?.toLowerCase();

    if (fileExtension === 'csv') {
      // Parse CSV
      const csvText = req.file.buffer.toString('utf-8');
      const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
      listingData = parsed.data;
    } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      // Parse Excel
      const workbook = XLSX.read(req.file.buffer);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      listingData = XLSX.utils.sheet_to_json(worksheet);
    } else {
      return res.status(400).json({
        success: false,
        error: 'Unsupported file type. Please upload CSV or Excel file.'
      });
    }

    if (listingData.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No data found in file'
      });
    }

    // Create listing records
    const listings = await Promise.all(
      listingData.map((data: any) => {
        return prisma.listing.create({
          data: {
            userId: req.userId!,
            workflowId,
            mlsNumber: data.mls_number || data.mlsNumber || data['MLS Number'],
            address: data.address || data.Address,
            city: data.city || data.City,
            state: data.state || data.State,
            zipCode: data.zip_code || data.zipCode || data.Zip || data.ZIP,
            price: data.price || data.Price ? parseFloat(data.price || data.Price) : null,
            bedrooms: data.bedrooms || data.Bedrooms ? parseInt(data.bedrooms || data.Bedrooms) : null,
            bathrooms: data.bathrooms || data.Bathrooms ? parseFloat(data.bathrooms || data.Bathrooms) : null,
            squareFeet: data.square_feet || data.squareFeet || data['Square Feet'] ? parseInt(data.square_feet || data.squareFeet || data['Square Feet']) : null,
            description: data.description || data.Description || '',
            listingData: data, // Store full row data
            uploadStatus: 'pending',
            imageUrls: []
          }
        });
      })
    );

    res.status(201).json({
      success: true,
      data: {
        count: listings.length,
        listings: listings.slice(0, 10), // Return first 10 for preview
        workflowId
      },
      message: `Successfully uploaded ${listings.length} listings`
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload listings'
    });
  }
});

// GET /api/listings - List user's listings
router.get('/', async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string;

    const where: any = { userId: req.userId };
    if (status) {
      where.uploadStatus = status;
    }

    const [listings, total] = await Promise.all([
      prisma.listing.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          workflow: {
            select: {
              id: true,
              name: true
            }
          }
        }
      }),
      prisma.listing.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        listings,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch listings'
    });
  }
});

// GET /api/listings/:id - Get listing details
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const listingId = parseInt(req.params.id);

    const listing = await prisma.listing.findFirst({
      where: {
        id: listingId,
        userId: req.userId
      },
      include: {
        workflow: true
      }
    });

    if (!listing) {
      return res.status(404).json({
        success: false,
        error: 'Listing not found'
      });
    }

    res.json({
      success: true,
      data: { listing }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch listing'
    });
  }
});

// POST /api/listings/:id/retry - Retry failed listing upload
router.post('/:id/retry', async (req: AuthRequest, res) => {
  try {
    const listingId = parseInt(req.params.id);

    const listing = await prisma.listing.findFirst({
      where: {
        id: listingId,
        userId: req.userId
      }
    });

    if (!listing) {
      return res.status(404).json({
        success: false,
        error: 'Listing not found'
      });
    }

    // Reset status to pending
    const updated = await prisma.listing.update({
      where: { id: listingId },
      data: {
        uploadStatus: 'pending',
        uploadResult: Prisma.JsonNull
      }
    });

    res.json({
      success: true,
      data: { listing: updated },
      message: 'Listing queued for retry'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retry listing'
    });
  }
});

export default router;
