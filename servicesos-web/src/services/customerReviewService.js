// src/services/customerReviewService.js
/**
 * Customer Review Automation Service
 * Handles service ratings and Google review page links
 */

import { collection, doc, addDoc, updateDoc, getDoc, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Create a customer review
 * @param {string} tenantId - Tenant ID
 * @param {object} reviewData - Review data
 * @returns {Promise<DocumentReference>}
 */
export async function createReview(tenantId, reviewData) {
  const reviewsRef = collection(db, 'tenants', tenantId, 'reviews');
  
  const data = {
    customerId: reviewData.customerId,
    customerName: reviewData.customerName || '',
    customerEmail: reviewData.customerEmail || '',
    
    // Rating (1-5 stars)
    rating: reviewData.rating || 5,
    
    // Would recommend
    wouldRecommend: reviewData.wouldRecommend !== false,
    
    // Review content
    review: reviewData.review || '',
    feedback: reviewData.feedback || '',
    
    // Related job
    jobId: reviewData.jobId || null,
    jobDate: reviewData.jobDate || null,
    
    // Service details
    serviceType: reviewData.serviceType || '',
    serviceAddress: reviewData.serviceAddress || '',
    
    // Google review
    googleReviewPosted: false,
    googleReviewUrl: null,
    
    // Status
    status: reviewData.status || 'pending',
    
    // Timestamps
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  return await addDoc(reviewsRef, data);
}

/**
 * Update review
 * @param {string} tenantId - Tenant ID
 * @param {string} reviewId - Review ID
 * @param {object} updates - Updates to apply
 * @returns {Promise<void>}
 */
export async function updateReview(tenantId, reviewId, updates) {
  const reviewRef = doc(db, 'tenants', tenantId, 'reviews', reviewId);
  await updateDoc(reviewRef, {
    ...updates,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Mark review as posted to Google
 * @param {string} tenantId - Tenant ID
 * @param {string} reviewId - Review ID
 * @param {string} googleReviewUrl - Google review URL
 * @returns {Promise<void>}
 */
export async function markGoogleReviewPosted(tenantId, reviewId, googleReviewUrl) {
  const reviewRef = doc(db, 'tenants', tenantId, 'reviews', reviewId);
  await updateDoc(reviewRef, {
    googleReviewPosted: true,
    googleReviewUrl,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Get review by ID
 * @param {string} tenantId - Tenant ID
 * @param {string} reviewId - Review ID
 * @returns {Promise<Object|null>}
 */
export async function getReview(tenantId, reviewId) {
  const reviewRef = doc(db, 'tenants', tenantId, 'reviews', reviewId);
  const reviewSnap = await getDoc(reviewRef);
  
  if (!reviewSnap.exists()) {
    return null;
  }
  
  return { id: reviewSnap.id, ...reviewSnap.data() };
}

/**
 * Get reviews for a tenant
 * @param {string} tenantId - Tenant ID
 * @param {number} limit - Maximum number of reviews to return
 * @returns {Promise<Array>}
 */
export async function getReviews(tenantId, limit = 50) {
  const reviewsRef = collection(db, 'tenants', tenantId, 'reviews');
  const q = query(reviewsRef, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  
  const reviews = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  return reviews.slice(0, limit);
}

/**
 * Get reviews for a customer
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @returns {Promise<Array>}
 */
export async function getCustomerReviews(tenantId, customerId) {
  const reviewsRef = collection(db, 'tenants', tenantId, 'reviews');
  const q = query(
    reviewsRef,
    where('customerId', '==', customerId),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get review analytics
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>}
 */
export async function getReviewAnalytics(tenantId) {
  const reviews = await getReviews(tenantId, 1000);
  
  let totalReviews = reviews.length;
  let totalRating = 0;
  let wouldRecommendCount = 0;
  let googleReviewPostedCount = 0;
  
  const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  
  for (const review of reviews) {
    totalRating += review.rating || 0;
    
    if (review.wouldRecommend) {
      wouldRecommendCount++;
    }
    
    if (review.googleReviewPosted) {
      googleReviewPostedCount++;
    }
    
    if (review.rating >= 1 && review.rating <= 5) {
      ratingDistribution[review.rating]++;
    }
  }
  
  const averageRating = totalReviews > 0 ? totalRating / totalReviews : 0;
  const recommendationRate = totalReviews > 0 ? (wouldRecommendCount / totalReviews) * 100 : 0;
  const googleReviewConversionRate = totalReviews > 0 ? (googleReviewPostedCount / totalReviews) * 100 : 0;
  
  return {
    totalReviews,
    averageRating: Math.round(averageRating * 10) / 10,
    recommendationRate: Math.round(recommendationRate * 10) / 10,
    googleReviewConversionRate: Math.round(googleReviewConversionRate * 10) / 10,
    ratingDistribution,
    fiveStarCount: ratingDistribution[5],
    fourStarCount: ratingDistribution[4],
    threeStarCount: ratingDistribution[3],
    twoStarCount: ratingDistribution[2],
    oneStarCount: ratingDistribution[1]
  };
}

/**
 * Get Google review URL for a tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<string|null>}
 */
export async function getGoogleReviewUrl(tenantId) {
  const tenantRef = doc(db, 'tenants', tenantId);
  const tenantSnap = await getDoc(tenantRef);
  
  if (!tenantSnap.exists()) {
    return null;
  }
  
  const tenant = tenantSnap.data();
  
  // If tenant has a custom Google review URL, use it
  if (tenant.googleReviewUrl) {
    return tenant.googleReviewUrl;
  }
  
  // Otherwise, try to construct from business name
  if (tenant.companyName) {
    const encodedName = encodeURIComponent(tenant.companyName);
    return `https://search.google.com/local/writereview?placeid=${encodedName}`;
  }
  
  return null;
}

/**
 * Generate review request email content
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>}
 */
export async function generateReviewRequest(tenantId, customerId, jobId) {
  const googleReviewUrl = await getGoogleReviewUrl(tenantId);
  
  return {
    subject: 'How was your cleaning service?',
    template: 'review-request',
    data: {
      googleReviewUrl,
      customerId,
      jobId
    }
  };
}

/**
 * Get reviews needing Google review follow-up
 * @param {string} tenantId - Tenant ID
 * @param {number} days - Number of days since review
 * @returns {Promise<Array>}
 */
export async function getReviewsNeedingFollowUp(tenantId, days = 7) {
  const reviews = await getReviews(tenantId, 1000);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  return reviews.filter(review => {
    const reviewDate = new Date(review.createdAt);
    return (
      review.rating >= 4 &&
      !review.googleReviewPosted &&
      reviewDate >= cutoffDate
    );
  });
}

/**
 * Get negative reviews (rating < 4)
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>}
 */
export async function getNegativeReviews(tenantId) {
  const reviews = await getReviews(tenantId, 1000);
  
  return reviews.filter(review => review.rating < 4);
}

/**
 * Export reviews as CSV
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<string>} CSV content
 */
export async function exportReviewsCSV(tenantId) {
  const reviews = await getReviews(tenantId, 1000);
  
  let csv = 'Date,Customer Name,Customer Email,Rating,Would Recommend,Review,Job ID,Service Type,Service Address,Google Review Posted\n';
  
  for (const review of reviews) {
    csv += `"${review.createdAt}","${review.customerName}","${review.customerEmail}",${review.rating},${review.wouldRecommend},"${review.review}","${review.jobId || ''}","${review.serviceType}","${review.serviceAddress}","${review.googleReviewPosted}"\n`;
  }
  
  return csv;
}
