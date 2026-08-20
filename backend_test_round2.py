#!/usr/bin/env python3
"""
Backend API tests for kibrisogrenci.com ROUND 2
Tests WhatsApp webhook, landlord dashboard, admin endpoints, and regression
"""

import requests
import json
import sys
import hmac
import hashlib

# Base URL from .env
BASE_URL = "https://rent-cyprus-north.preview.emergentagent.com/api"

def test_whatsapp_webhook_security():
    """(A) WHATSAPP WEBHOOK SECURITY - HIGHEST PRIORITY"""
    print("\n=== TEST A: WHATSAPP WEBHOOK SECURITY (HIGHEST PRIORITY) ===")
    all_passed = True
    
    # Test A1: POST with invalid signature (should be 403)
    try:
        print("\nA1. POST /api/whatsapp/webhook with invalid signature (should be 403)")
        headers = {'x-hub-signature-256': 'sha256=deadbeef'}
        response = requests.post(f"{BASE_URL}/whatsapp/webhook", 
                                headers=headers, 
                                json={"x": 1})
        print(f"Status: {response.status_code}")
        
        if response.status_code != 403:
            print(f"❌ FAIL: Expected 403, got {response.status_code}")
            all_passed = False
        else:
            print(f"✅ PASS: Invalid signature rejected with 403")
    
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    # Test A2: GET with wrong verify token (should be 403)
    try:
        print("\nA2. GET /api/whatsapp/webhook with wrong verify token (should be 403)")
        response = requests.get(f"{BASE_URL}/whatsapp/webhook", 
                               params={
                                   'hub.mode': 'subscribe',
                                   'hub.verify_token': 'WRONG',
                                   'hub.challenge': '123'
                               })
        print(f"Status: {response.status_code}")
        
        if response.status_code != 403:
            print(f"❌ FAIL: Expected 403, got {response.status_code}")
            all_passed = False
        else:
            print(f"✅ PASS: Wrong verify token rejected with 403")
    
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    return all_passed


def test_whatsapp_sim():
    """(B) WHATSAPP SIM (demo)"""
    print("\n=== TEST B: WHATSAPP SIM (DEMO) ===")
    all_passed = True
    
    # Test B1: Student flow
    try:
        print("\nB1. POST /api/whatsapp/sim - student flow")
        response = requests.post(f"{BASE_URL}/whatsapp/sim", json={
            "flow": "student",
            "message": "Girne ucuz doğrulanmış"
        })
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            
            if data.get('reply_type') != 'cards':
                print(f"❌ FAIL: Expected reply_type 'cards', got {data.get('reply_type')}")
                all_passed = False
            
            if 'cards' not in data:
                print(f"❌ FAIL: Missing 'cards' field")
                all_passed = False
            else:
                cards = data['cards']
                if len(cards) > 5:
                    print(f"❌ FAIL: Expected up to 5 cards, got {len(cards)}")
                    all_passed = False
                
                # Check card structure
                if len(cards) > 0:
                    card = cards[0]
                    required_fields = ['ref', 'title', 'price', 'walking_minutes', 'city']
                    for field in required_fields:
                        if field not in card:
                            print(f"❌ FAIL: Card missing field '{field}'")
                            all_passed = False
            
            if all_passed:
                print(f"✅ PASS: Student flow returns cards (count: {len(data.get('cards', []))})")
                print(f"  - Sample card: ref={data['cards'][0].get('ref')}, city={data['cards'][0].get('city')}")
    
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    # Test B2: Landlord flow
    try:
        print("\nB2. POST /api/whatsapp/sim - landlord flow")
        response = requests.post(f"{BASE_URL}/whatsapp/sim", json={
            "flow": "landlord",
            "message": "Girne 2+1 620 GBP eşyalı"
        })
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            
            if data.get('reply_type') != 'summary':
                print(f"❌ FAIL: Expected reply_type 'summary', got {data.get('reply_type')}")
                all_passed = False
            
            if 'extracted' not in data:
                print(f"❌ FAIL: Missing 'extracted' field")
                all_passed = False
            else:
                extracted = data['extracted']
                # Check that extracted has some fields
                if not isinstance(extracted, dict) or len(extracted) == 0:
                    print(f"❌ FAIL: 'extracted' should be a non-empty object")
                    all_passed = False
            
            if all_passed:
                print(f"✅ PASS: Landlord flow returns summary with extracted fields")
                print(f"  - Extracted: {data.get('extracted')}")
    
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    return all_passed


def test_landlord_dashboard():
    """(C) LANDLORD DASHBOARD"""
    print("\n=== TEST C: LANDLORD DASHBOARD ===")
    all_passed = True
    
    # Test C1: GET /api/my/listings
    try:
        print("\nC1. GET /api/my/listings?owner=Ayşe%20Yılmaz")
        response = requests.get(f"{BASE_URL}/my/listings", params={"owner": "Ayşe Yılmaz"})
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            
            if 'items' not in data:
                print(f"❌ FAIL: Missing 'items' field")
                all_passed = False
            
            if 'quota' not in data:
                print(f"❌ FAIL: Missing 'quota' field")
                all_passed = False
            else:
                quota = data['quota']
                required_quota_fields = ['used', 'total', 'package']
                for field in required_quota_fields:
                    if field not in quota:
                        print(f"❌ FAIL: Quota missing field '{field}'")
                        all_passed = False
            
            if all_passed:
                print(f"✅ PASS: GET /api/my/listings working")
                print(f"  - Items: {len(data.get('items', []))}")
                print(f"  - Quota: {data['quota'].get('used')}/{data['quota'].get('total')} ({data['quota'].get('package')})")
    
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    # Test C2: POST /api/my/listings
    try:
        print("\nC2. POST /api/my/listings (create new listing)")
        response = requests.post(f"{BASE_URL}/my/listings", json={
            "owner": "Ayşe Yılmaz",
            "title": "Test ilan",
            "price_amount": 500,
            "price_currency": "GBP"
        })
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            
            if data.get('ok') != True:
                print(f"❌ FAIL: Expected ok:true, got {data.get('ok')}")
                all_passed = False
            
            if 'item' not in data:
                print(f"❌ FAIL: Missing 'item' field")
                all_passed = False
            else:
                item = data['item']
                if item.get('status') != 'pending_review':
                    print(f"❌ FAIL: Expected status 'pending_review', got {item.get('status')}")
                    all_passed = False
            
            if all_passed:
                print(f"✅ PASS: POST /api/my/listings working")
                print(f"  - Created item status: {data['item'].get('status')}")
                print(f"  - Item ref: {data['item'].get('reference_code')}")
    
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    # Test C3: GET /api/my/analytics
    try:
        print("\nC3. GET /api/my/analytics")
        response = requests.get(f"{BASE_URL}/my/analytics")
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            
            if 'trend' not in data:
                print(f"❌ FAIL: Missing 'trend' field")
                all_passed = False
            else:
                if not isinstance(data['trend'], list):
                    print(f"❌ FAIL: 'trend' should be an array")
                    all_passed = False
            
            if all_passed:
                print(f"✅ PASS: GET /api/my/analytics working")
                print(f"  - Trend entries: {len(data.get('trend', []))}")
    
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    # Test C4: GET /api/my/inquiries
    try:
        print("\nC4. GET /api/my/inquiries")
        response = requests.get(f"{BASE_URL}/my/inquiries")
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            
            if 'items' not in data:
                print(f"❌ FAIL: Missing 'items' field")
                all_passed = False
            
            if all_passed:
                print(f"✅ PASS: GET /api/my/inquiries working")
                print(f"  - Inquiries: {len(data.get('items', []))}")
    
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    # Test C5: GET /api/my/billing
    try:
        print("\nC5. GET /api/my/billing?owner=Ayşe%20Yılmaz")
        response = requests.get(f"{BASE_URL}/my/billing", params={"owner": "Ayşe Yılmaz"})
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            
            required_fields = ['subscription', 'invoices', 'bank_instructions']
            for field in required_fields:
                if field not in data:
                    print(f"❌ FAIL: Missing field '{field}'")
                    all_passed = False
            
            if all_passed:
                print(f"✅ PASS: GET /api/my/billing working")
                print(f"  - Subscription: {data.get('subscription', {}).get('package')}")
                print(f"  - Invoices: {len(data.get('invoices', []))}")
    
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    return all_passed


def test_admin_endpoints():
    """(D) ADMIN ENDPOINTS"""
    print("\n=== TEST D: ADMIN ENDPOINTS ===")
    all_passed = True
    
    # Test D1: GET /api/admin/queue
    try:
        print("\nD1. GET /api/admin/queue")
        response = requests.get(f"{BASE_URL}/admin/queue")
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            
            if 'items' not in data:
                print(f"❌ FAIL: Missing 'items' field")
                all_passed = False
            else:
                items = data['items']
                # Check for at least one item with priority:true and risk_flags length > 0
                has_priority_with_risk = False
                for item in items:
                    if item.get('priority') == True and isinstance(item.get('risk_flags'), list) and len(item.get('risk_flags', [])) > 0:
                        has_priority_with_risk = True
                        break
                
                if not has_priority_with_risk:
                    print(f"❌ FAIL: Expected at least one item with priority:true and risk_flags length > 0")
                    all_passed = False
            
            if all_passed:
                print(f"✅ PASS: GET /api/admin/queue working")
                print(f"  - Queue items: {len(data.get('items', []))}")
                print(f"  - Has priority item with risk flags: Yes")
    
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    # Test D2: GET /api/admin/health
    try:
        print("\nD2. GET /api/admin/health")
        response = requests.get(f"{BASE_URL}/admin/health")
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            
            if 'items' not in data:
                print(f"❌ FAIL: Missing 'items' field")
                all_passed = False
            else:
                items = data['items']
                if len(items) != 4:
                    print(f"❌ FAIL: Expected 4 health checks, got {len(items)}")
                    all_passed = False
                
                # Check for required checks
                check_names = [item.get('check_name') for item in items]
                required_checks = ['smtp_canary', 'fx_rates', 'storage', 'whatsapp_spend']
                for check in required_checks:
                    if check not in check_names:
                        print(f"❌ FAIL: Missing health check '{check}'")
                        all_passed = False
            
            if all_passed:
                print(f"✅ PASS: GET /api/admin/health working")
                print(f"  - Health checks: {len(data.get('items', []))}")
                print(f"  - Checks: {', '.join([item.get('check_name') for item in data.get('items', [])])}")
    
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    # Test D3: POST /api/admin/invoices/pay
    try:
        print("\nD3. POST /api/admin/invoices/pay")
        response = requests.post(f"{BASE_URL}/admin/invoices/pay", json={"id": "inv-2"})
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            
            if data.get('ok') != True:
                print(f"❌ FAIL: Expected ok:true, got {data.get('ok')}")
                all_passed = False
            
            if data.get('subscription_activated') != True:
                print(f"❌ FAIL: Expected subscription_activated:true, got {data.get('subscription_activated')}")
                all_passed = False
            
            if all_passed:
                print(f"✅ PASS: POST /api/admin/invoices/pay working")
                print(f"  - Invoice marked paid, subscription activated")
    
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    # Test D4: GET /api/admin/audit (check for invoice.mark_paid)
    try:
        print("\nD4. GET /api/admin/audit (verify invoice.mark_paid entry)")
        response = requests.get(f"{BASE_URL}/admin/audit")
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            
            if 'items' not in data:
                print(f"❌ FAIL: Missing 'items' field")
                all_passed = False
            else:
                items = data['items']
                if len(items) == 0:
                    print(f"❌ FAIL: Audit log is empty")
                    all_passed = False
                else:
                    # Check if the newest entry has action == "invoice.mark_paid"
                    newest = items[0]
                    if newest.get('action') != 'invoice.mark_paid':
                        print(f"❌ FAIL: Expected newest entry action to be 'invoice.mark_paid', got {newest.get('action')}")
                        all_passed = False
            
            if all_passed:
                print(f"✅ PASS: GET /api/admin/audit working")
                print(f"  - Audit entries: {len(data.get('items', []))}")
                print(f"  - Newest entry action: {data['items'][0].get('action')}")
    
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    # Test D5: POST /api/admin/coords/verify
    try:
        print("\nD5. POST /api/admin/coords/verify")
        response = requests.post(f"{BASE_URL}/admin/coords/verify", json={"id": "u-metu"})
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            
            if data.get('ok') != True:
                print(f"❌ FAIL: Expected ok:true, got {data.get('ok')}")
                all_passed = False
            
            if all_passed:
                print(f"✅ PASS: POST /api/admin/coords/verify working")
    
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    # Test D6: GET /api/admin/users
    try:
        print("\nD6. GET /api/admin/users")
        response = requests.get(f"{BASE_URL}/admin/users")
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            
            if 'items' not in data:
                print(f"❌ FAIL: Missing 'items' field")
                all_passed = False
            
            if all_passed:
                print(f"✅ PASS: GET /api/admin/users working")
                print(f"  - Users: {len(data.get('items', []))}")
    
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    # Test D7: GET /api/admin/reports
    try:
        print("\nD7. GET /api/admin/reports")
        response = requests.get(f"{BASE_URL}/admin/reports")
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            
            if 'items' not in data:
                print(f"❌ FAIL: Missing 'items' field")
                all_passed = False
            
            if all_passed:
                print(f"✅ PASS: GET /api/admin/reports working")
                print(f"  - Reports: {len(data.get('items', []))}")
    
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    # Test D8: GET /api/admin/invoices
    try:
        print("\nD8. GET /api/admin/invoices")
        response = requests.get(f"{BASE_URL}/admin/invoices")
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            
            if 'items' not in data:
                print(f"❌ FAIL: Missing 'items' field")
                all_passed = False
            
            if all_passed:
                print(f"✅ PASS: GET /api/admin/invoices working")
                print(f"  - Invoices: {len(data.get('items', []))}")
    
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    return all_passed


def test_regression():
    """(E) REGRESSION TESTS"""
    print("\n=== TEST E: REGRESSION TESTS ===")
    all_passed = True
    
    # Test E1: Contact gating in /api/listings
    try:
        print("\nE1. Regression: Contact gating in /api/listings")
        response = requests.get(f"{BASE_URL}/listings")
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            response_text = json.dumps(data)
            
            # Check for forbidden fields
            forbidden_found = False
            if 'phone' in response_text.lower():
                print(f"❌ FAIL: Response contains 'phone' field")
                forbidden_found = True
            
            for item in data.get('items', []):
                if 'lat' in item or 'lng' in item:
                    print(f"❌ FAIL: Item contains exact lat/lng coordinates")
                    forbidden_found = True
                    break
                
                if 'landlord' in item and isinstance(item['landlord'], dict):
                    if 'phone' in item['landlord']:
                        print(f"❌ FAIL: Item contains landlord.phone")
                        forbidden_found = True
                        break
            
            if forbidden_found:
                all_passed = False
            else:
                print(f"✅ PASS: Contact gating verified in /api/listings")
    
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    # Test E2: Contact gating in /api/listings/:ref
    try:
        print("\nE2. Regression: Contact gating in /api/listings/A3F9K2")
        response = requests.get(f"{BASE_URL}/listings/A3F9K2")
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            response_text = json.dumps(data)
            
            # Check for forbidden fields
            forbidden_found = False
            if 'phone' in response_text.lower():
                print(f"❌ FAIL: Response contains 'phone' field")
                forbidden_found = True
            
            if 'lat' in data or 'lng' in data:
                print(f"❌ FAIL: Response contains exact lat/lng coordinates")
                forbidden_found = True
            
            if forbidden_found:
                all_passed = False
            else:
                print(f"✅ PASS: Contact gating verified in /api/listings/A3F9K2")
    
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    # Test E3: Rate limiting (16th request should be 429)
    try:
        print("\nE3. Regression: Rate limiting (16 requests with fresh studentId)")
        student_id = f"regression-test-{hash('unique-seed-round2')}"
        
        # Make 15 requests (should all succeed)
        success_count = 0
        for i in range(15):
            response = requests.post(f"{BASE_URL}/reveal", json={
                "ref": "A3F9K2",
                "signedIn": True,
                "studentId": student_id
            })
            if response.status_code == 200:
                success_count += 1
        
        if success_count != 15:
            print(f"❌ FAIL: Expected 15 successful requests, got {success_count}")
            all_passed = False
        else:
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
            print(f"✅ PASS: Rate limiting verified (16th request returns 429)")
    
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        all_passed = False
    
    return all_passed


def main():
    """Run all ROUND 2 tests and report results"""
    print("=" * 70)
    print("BACKEND API TESTS - ROUND 2 - kibrisogrenci.com")
    print("=" * 70)
    print(f"Base URL: {BASE_URL}")
    
    results = {
        "(A) WhatsApp Webhook Security": test_whatsapp_webhook_security(),
        "(B) WhatsApp Sim": test_whatsapp_sim(),
        "(C) Landlord Dashboard": test_landlord_dashboard(),
        "(D) Admin Endpoints": test_admin_endpoints(),
        "(E) Regression Tests": test_regression(),
    }
    
    print("\n" + "=" * 70)
    print("TEST SUMMARY - ROUND 2")
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
