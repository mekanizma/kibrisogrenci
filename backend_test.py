#!/usr/bin/env python3
"""
Backend API tests for kibrisogrenci.com MOCKED API
Tests all endpoints under /api prefix with focus on contact gating
"""

import requests
import json
import sys

# Base URL from .env
BASE_URL = "https://rent-cyprus-north.preview.emergentagent.com/api"

def test_config():
    """Test GET /api/config - verify structure and METU exclusion"""
    print("\n=== TEST 1: GET /api/config ===")
    try:
        response = requests.get(f"{BASE_URL}/config")
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        # Check required fields
        required_fields = ['fx_to_gbp', 'currencies', 'hero_image', 'packages', 'stats', 'cities', 'universities', 'all_universities']
        for field in required_fields:
            if field not in data:
                print(f"❌ FAIL: Missing field '{field}'")
                return False
        
        # Check packages count
        if len(data['packages']) != 3:
            print(f"❌ FAIL: Expected 3 packages, got {len(data['packages'])}")
            return False
        
        # CRITICAL: Check universities count (should be 6, excluding METU)
        if len(data['universities']) != 6:
            print(f"❌ FAIL: Expected 6 universities (METU excluded), got {len(data['universities'])}")
            return False
        
        # CRITICAL: Verify METU is NOT in universities
        metu_in_universities = any(u.get('slug') == 'odtu-kuzey-kibris' for u in data['universities'])
        if metu_in_universities:
            print(f"❌ FAIL: METU (odtu-kuzey-kibris) should NOT be in universities array")
            return False
        
        # CRITICAL: Check all_universities count (should be 7, including METU)
        if len(data['all_universities']) != 7:
            print(f"❌ FAIL: Expected 7 in all_universities (including METU), got {len(data['all_universities'])}")
            return False
        
        # CRITICAL: Verify METU IS in all_universities
        metu_in_all = any(u.get('slug') == 'odtu-kuzey-kibris' for u in data['all_universities'])
        if not metu_in_all:
            print(f"❌ FAIL: METU (odtu-kuzey-kibris) should be in all_universities array")
            return False
        
        print(f"✅ PASS: Config endpoint working correctly")
        print(f"  - universities: {len(data['universities'])} (METU excluded)")
        print(f"  - all_universities: {len(data['all_universities'])} (METU included)")
        print(f"  - packages: {len(data['packages'])}")
        print(f"  - cities: {data['cities']}")
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        return False


def test_listings_basic():
    """Test GET /api/listings - basic and filtered queries"""
    print("\n=== TEST 2: GET /api/listings (basic + filters) ===")
    all_passed = True
    
    # Test 2a: Basic listings (should return 12 total)
    try:
        print("\n2a. Basic listings (total count)")
        response = requests.get(f"{BASE_URL}/listings")
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            if data['total'] != 12:
                print(f"❌ FAIL: Expected 12 total listings, got {data['total']}")
                all_passed = False
            else:
                print(f"✅ PASS: Total listings = 12")
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    # Test 2b: Featured listings with limit
    try:
        print("\n2b. Featured listings (featured=1&limit=6)")
        response = requests.get(f"{BASE_URL}/listings?featured=1&limit=6")
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            # Total should be 4 (featured count), items returned should be min(4, 6) = 4
            if data['total'] != 4:
                print(f"❌ FAIL: Expected 4 featured listings, got {data['total']}")
                all_passed = False
            else:
                print(f"✅ PASS: Featured listings total = 4")
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    # Test 2c: University filter
    try:
        print("\n2c. University filter (university=u-emu)")
        response = requests.get(f"{BASE_URL}/listings?university=u-emu")
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            # Check all items are for EMU
            all_emu = all(item.get('uni') == 'u-emu' for item in data['items'])
            if not all_emu:
                print(f"❌ FAIL: Not all listings are for u-emu")
                all_passed = False
            else:
                print(f"✅ PASS: University filter working (EMU listings: {len(data['items'])})")
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    # Test 2d: Property type filter
    try:
        print("\n2d. Property type filter (property_type=studio)")
        response = requests.get(f"{BASE_URL}/listings?property_type=studio")
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            all_studio = all(item.get('property_type') == 'studio' for item in data['items'])
            if not all_studio:
                print(f"❌ FAIL: Not all listings are studios")
                all_passed = False
            else:
                print(f"✅ PASS: Property type filter working (studios: {len(data['items'])})")
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    # Test 2e: Verified only filter
    try:
        print("\n2e. Verified only filter (verified_only=true)")
        response = requests.get(f"{BASE_URL}/listings?verified_only=true")
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            all_verified = all(item.get('landlord_verified') == True for item in data['items'])
            if not all_verified:
                print(f"❌ FAIL: Not all listings have verified landlords")
                all_passed = False
            else:
                print(f"✅ PASS: Verified only filter working ({len(data['items'])} verified)")
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    # Test 2f: Sort by price ascending
    try:
        print("\n2f. Sort by price ascending (sort=price_asc)")
        response = requests.get(f"{BASE_URL}/listings?sort=price_asc")
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            prices = [item.get('price_gbp') for item in data['items']]
            is_sorted = all(prices[i] <= prices[i+1] for i in range(len(prices)-1))
            if not is_sorted:
                print(f"❌ FAIL: Prices not in ascending order: {prices}")
                all_passed = False
            else:
                print(f"✅ PASS: Price sorting working (prices: {prices[:5]}...)")
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    return all_passed


def test_contact_gating_listings():
    """CRITICAL: Test that listings responses NEVER contain phone/exact coords"""
    print("\n=== TEST 3: CONTACT GATING - Listings (CRITICAL) ===")
    all_passed = True
    
    try:
        response = requests.get(f"{BASE_URL}/listings")
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        response_text = json.dumps(data)
        
        # CRITICAL: Check that response does NOT contain phone numbers
        if 'phone' in response_text.lower() or '+90' in response_text:
            print(f"❌ FAIL: Response contains phone number (contact gating violated)")
            all_passed = False
        else:
            print(f"✅ PASS: No phone numbers in listings response")
        
        # CRITICAL: Check each item for forbidden fields
        for idx, item in enumerate(data['items']):
            # Check for phone field
            if 'phone' in item:
                print(f"❌ FAIL: Item {idx} contains 'phone' field")
                all_passed = False
            
            # Check for exact lat/lng (should not be present)
            if 'lat' in item or 'lng' in item:
                print(f"❌ FAIL: Item {idx} contains exact 'lat' or 'lng' coordinates")
                all_passed = False
            
            # Check for landlord.phone
            if 'landlord' in item and isinstance(item['landlord'], dict):
                if 'phone' in item['landlord']:
                    print(f"❌ FAIL: Item {idx} contains landlord.phone")
                    all_passed = False
            
            # Verify price_index is present
            if 'price_index' not in item:
                print(f"❌ FAIL: Item {idx} missing price_index")
                all_passed = False
        
        if all_passed:
            print(f"✅ PASS: All {len(data['items'])} listings properly gated (no phone/exact coords)")
            print(f"✅ PASS: All listings have price_index")
        
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    return all_passed


def test_listing_detail():
    """Test GET /api/listings/:ref - detail with contact gating"""
    print("\n=== TEST 4: GET /api/listings/:ref (detail) ===")
    all_passed = True
    
    # Test 4a: Valid listing (A3F9K2)
    try:
        print("\n4a. Valid listing detail (A3F9K2)")
        response = requests.get(f"{BASE_URL}/listings/A3F9K2")
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            
            # Check required fields
            if 'university' not in data:
                print(f"❌ FAIL: Missing 'university' field")
                all_passed = False
            
            if 'price_index' not in data:
                print(f"❌ FAIL: Missing 'price_index' field")
                all_passed = False
            else:
                pi = data['price_index']
                if pi.get('enough') != True:
                    print(f"❌ FAIL: price_index.enough should be true")
                    all_passed = False
                if pi.get('sample_size') != 8:
                    print(f"❌ FAIL: price_index.sample_size should be 8, got {pi.get('sample_size')}")
                    all_passed = False
            
            if 'similar' not in data:
                print(f"❌ FAIL: Missing 'similar' field")
                all_passed = False
            
            # CRITICAL: Check contact gating
            response_text = json.dumps(data)
            if 'phone' in response_text.lower() or '+90' in response_text:
                print(f"❌ FAIL: Response contains phone number (contact gating violated)")
                all_passed = False
            
            if 'lat' in data or 'lng' in data:
                print(f"❌ FAIL: Response contains exact lat/lng coordinates")
                all_passed = False
            
            if all_passed:
                print(f"✅ PASS: Listing detail working with proper contact gating")
                print(f"  - university: {data.get('university', {}).get('short')}")
                print(f"  - price_index: enough={data['price_index'].get('enough')}, sample_size={data['price_index'].get('sample_size')}")
                print(f"  - similar listings: {len(data.get('similar', []))}")
    
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    # Test 4b: Invalid listing (404)
    try:
        print("\n4b. Invalid listing (NOTREAL)")
        response = requests.get(f"{BASE_URL}/listings/NOTREAL")
        print(f"Status: {response.status_code}")
        
        if response.status_code != 404:
            print(f"❌ FAIL: Expected 404, got {response.status_code}")
            all_passed = False
        else:
            print(f"✅ PASS: Invalid listing returns 404")
    
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    return all_passed


def test_universities():
    """Test GET /api/universities and /api/universities/:slug"""
    print("\n=== TEST 5: GET /api/universities ===")
    all_passed = True
    
    # Test 5a: List all universities
    try:
        print("\n5a. List all universities")
        response = requests.get(f"{BASE_URL}/universities")
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            if len(data['items']) != 7:
                print(f"❌ FAIL: Expected 7 universities, got {len(data['items'])}")
                all_passed = False
            else:
                print(f"✅ PASS: Universities list returns 7 items")
    
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    # Test 5b: University detail with price index
    try:
        print("\n5b. University detail (dogu-akdeniz-universitesi)")
        response = requests.get(f"{BASE_URL}/universities/dogu-akdeniz-universitesi")
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            
            if 'university' not in data:
                print(f"❌ FAIL: Missing 'university' field")
                all_passed = False
            
            if 'listings' not in data:
                print(f"❌ FAIL: Missing 'listings' field")
                all_passed = False
            
            if 'price_index' not in data:
                print(f"❌ FAIL: Missing 'price_index' field")
                all_passed = False
            else:
                # Check that price_index has GBP figures
                pi = data['price_index']
                if len(pi) > 0:
                    first_row = pi[0]
                    if 'median_gbp' not in first_row:
                        print(f"❌ FAIL: price_index missing median_gbp")
                        all_passed = False
            
            if all_passed:
                print(f"✅ PASS: University detail working")
                print(f"  - university: {data.get('university', {}).get('short')}")
                print(f"  - listings: {data.get('listings_count')}")
                print(f"  - price_index rows: {len(data.get('price_index', []))}")
    
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    # Test 5c: Invalid university (404)
    try:
        print("\n5c. Invalid university (nope)")
        response = requests.get(f"{BASE_URL}/universities/nope")
        print(f"Status: {response.status_code}")
        
        if response.status_code != 404:
            print(f"❌ FAIL: Expected 404, got {response.status_code}")
            all_passed = False
        else:
            print(f"✅ PASS: Invalid university returns 404")
    
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    return all_passed


def test_reveal_contact_gating():
    """Test POST /api/reveal - contact gating and rate limiting"""
    print("\n=== TEST 6: POST /api/reveal (contact gating + rate limit) ===")
    all_passed = True
    
    # Test 6a: Without signedIn (401)
    try:
        print("\n6a. Reveal without signedIn (should be 401)")
        response = requests.post(f"{BASE_URL}/reveal", json={"ref": "A3F9K2"})
        print(f"Status: {response.status_code}")
        
        if response.status_code != 401:
            print(f"❌ FAIL: Expected 401, got {response.status_code}")
            all_passed = False
        else:
            print(f"✅ PASS: Reveal without auth returns 401")
    
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    # Test 6b: With signedIn and studentId (200)
    try:
        print("\n6b. Reveal with signedIn (should be 200)")
        response = requests.post(f"{BASE_URL}/reveal", json={
            "ref": "A3F9K2",
            "signedIn": True,
            "studentId": "stud-1"
        })
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            
            if 'phone' not in data:
                print(f"❌ FAIL: Missing 'phone' in response")
                all_passed = False
            
            if 'whatsapp_url' not in data:
                print(f"❌ FAIL: Missing 'whatsapp_url' in response")
                all_passed = False
            else:
                # Check whatsapp_url format
                wa_url = data['whatsapp_url']
                if not wa_url.startswith('https://wa.me/'):
                    print(f"❌ FAIL: whatsapp_url doesn't start with https://wa.me/")
                    all_passed = False
                
                # Check that it contains digits
                if not any(c.isdigit() for c in wa_url):
                    print(f"❌ FAIL: whatsapp_url doesn't contain digits")
                    all_passed = False
                
                # Check that it contains the ref code
                if 'A3F9K2' not in wa_url:
                    print(f"❌ FAIL: whatsapp_url doesn't contain ref code A3F9K2")
                    all_passed = False
            
            if all_passed:
                print(f"✅ PASS: Reveal with auth returns phone and whatsapp_url")
                print(f"  - phone: {data.get('phone')}")
                print(f"  - whatsapp_url: {data.get('whatsapp_url')[:50]}...")
    
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    # Test 6c: Rate limiting (16th request should be 429)
    try:
        print("\n6c. Rate limiting test (15 requests OK, 16th should be 429)")
        student_id = "ratelimit-test-unique-12345"
        
        # Make 15 requests (should all succeed)
        for i in range(15):
            response = requests.post(f"{BASE_URL}/reveal", json={
                "ref": "A3F9K2",
                "signedIn": True,
                "studentId": student_id
            })
            if response.status_code != 200:
                print(f"❌ FAIL: Request {i+1}/15 failed with status {response.status_code}")
                all_passed = False
                break
        
        if all_passed:
            print(f"  - First 15 requests: ✅ All returned 200")
        
        # 16th request should be rate limited
        response = requests.post(f"{BASE_URL}/reveal", json={
            "ref": "A3F9K2",
            "signedIn": True,
            "studentId": student_id
        })
        print(f"  - 16th request status: {response.status_code}")
        
        if response.status_code != 429:
            print(f"❌ FAIL: Expected 429 on 16th request, got {response.status_code}")
            all_passed = False
        else:
            print(f"✅ PASS: Rate limiting working (16th request returns 429)")
    
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    return all_passed


def test_reports():
    """Test POST /api/reports"""
    print("\n=== TEST 7: POST /api/reports ===")
    all_passed = True
    
    # Test 7a: Valid report
    try:
        print("\n7a. Valid report")
        response = requests.post(f"{BASE_URL}/reports", json={
            "ref": "A3F9K2",
            "reason": "scam"
        })
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            if data.get('ok') != True:
                print(f"❌ FAIL: Expected ok:true, got {data}")
                all_passed = False
            else:
                print(f"✅ PASS: Report submitted successfully")
    
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    # Test 7b: Invalid report (missing fields)
    try:
        print("\n7b. Invalid report (missing fields)")
        response = requests.post(f"{BASE_URL}/reports", json={})
        print(f"Status: {response.status_code}")
        
        if response.status_code != 400:
            print(f"❌ FAIL: Expected 400, got {response.status_code}")
            all_passed = False
        else:
            print(f"✅ PASS: Invalid report returns 400")
    
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    return all_passed


def main():
    """Run all tests and report results"""
    print("=" * 70)
    print("BACKEND API TESTS - kibrisogrenci.com MOCKED API")
    print("=" * 70)
    print(f"Base URL: {BASE_URL}")
    
    results = {
        "GET /api/config": test_config(),
        "GET /api/listings (basic + filters)": test_listings_basic(),
        "CONTACT GATING - Listings": test_contact_gating_listings(),
        "GET /api/listings/:ref": test_listing_detail(),
        "GET /api/universities": test_universities(),
        "POST /api/reveal": test_reveal_contact_gating(),
        "POST /api/reports": test_reports(),
    }
    
    print("\n" + "=" * 70)
    print("TEST SUMMARY")
    print("=" * 70)
    
    for test_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    total = len(results)
    passed = sum(1 for v in results.values() if v)
    
    print("\n" + "=" * 70)
    print(f"TOTAL: {passed}/{total} test groups passed")
    print("=" * 70)
    
    return 0 if all(results.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
