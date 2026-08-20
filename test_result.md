#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: "kibrisogrenci.com — North Cyprus student housing marketplace. Slice 1 (of 4) delivered: public marketplace with mock data (MOCKED API), TR/EN i18n, trust signals (verification badge, fair price index in GBP, walking distance, price history, scam warnings), and contact gating. Supabase keys wired for future real integration; LLM/WhatsApp/SMTP/FX are MOCKED for now."

backend:
  - task: "GET /api/config (fx, universities public-only, packages, stats, cities)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Returns fx_to_gbp, currencies, hero_image, verified universities only (METU excluded, coordinates_verified=false), packages, stats, cities. Verify METU (odtu-kuzey-kibris) NOT present in universities but present in all_universities."
        -working: true
        -agent: "testing"
        -comment: "✅ PASS: Config endpoint working correctly. Verified: universities array has 6 items (METU excluded), all_universities has 7 items (METU included), 3 packages, fx_to_gbp, currencies, hero_image, stats, and cities all present."

  - task: "GET /api/listings with filters + sort (contact gating: no phone in response)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Filters: university, city, property_type, bedrooms, furnished, bills_included, gender, verified_only, max_walk, amenities(comma), price_min/max(GBP), featured, sort(new/price_asc/price_desc/distance). CRITICAL: response items must NEVER contain landlord phone or exact lat/lng. Each item has price_index {enough, position, pct, sample_size}. Verify featured=1 returns 4."
        -working: true
        -agent: "testing"
        -comment: "✅ PASS: All listing filters and sorting working correctly. Verified: total 12 listings, featured=1 returns 4, university filter (u-emu), property_type filter (studio), verified_only filter, sort=price_asc. CRITICAL CONTACT GATING: Verified NO phone numbers, NO exact lat/lng in any response. All 12 listings have price_index."

  - task: "GET /api/listings/:ref (detail + price_index + similar, no phone/exact coords)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "ref A3F9K2 should return listing with university, price_index (enough=true, sample_size=8), similar[]. Must NOT include landlord.phone or exact lat/lng. Unknown ref returns 404."
        -working: true
        -agent: "testing"
        -comment: "✅ PASS: Listing detail working correctly. Verified A3F9K2 returns: university (EMU / DAÜ), price_index (enough=true, sample_size=8), similar array (3 items). CRITICAL CONTACT GATING: NO phone or exact lat/lng in response. Invalid ref (NOTREAL) returns 404."

  - task: "GET /api/universities and /api/universities/:slug (price_index in GBP)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Slug dogu-akdeniz-universitesi returns university + listings + price_index rows (median/p25/p75 in GBP). Buckets with sample_size<5 exist (gau studio n=4, kyrenia 3+ n=3)."
        -working: true
        -agent: "testing"
        -comment: "✅ PASS: Universities endpoints working correctly. GET /api/universities returns 7 items. GET /api/universities/dogu-akdeniz-universitesi returns university (EMU / DAÜ), 4 listings, 3 price_index rows with GBP figures (median_gbp, p25_gbp, p75_gbp). Invalid slug (nope) returns 404."

  - task: "POST /api/reveal — contact gating + daily rate limit (15)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Without signedIn/studentId -> 401. With signedIn:true + studentId -> returns phone + whatsapp_url (wa.me with ref code). 16th reveal same studentId same day -> 429. Verify limit enforcement by looping 16 POSTs with same studentId."
        -working: true
        -agent: "testing"
        -comment: "✅ PASS: Contact reveal and rate limiting working correctly. Without signedIn returns 401. With signedIn+studentId returns 200 with phone (+90 533 111 22 33) and whatsapp_url (https://wa.me/905331112233 with ref code A3F9K2 in message). Rate limiting verified: first 15 requests return 200, 16th request returns 429."

  - task: "POST /api/reports (anonymous allowed)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "low"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Requires ref + reason -> {ok:true}. Missing fields -> 400."
        -working: true
        -agent: "testing"
        -comment: "✅ PASS: Reports endpoint working correctly. Valid report (ref + reason) returns 200 with {ok:true}. Missing fields returns 400."

frontend:
  - task: "Public marketplace UI (home/search/listing/university), TR/EN, currency toggle, gated reveal"
    implemented: true
    working: "NA"
    file: "app/page.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Verified manually via screenshots: home, featured cards, listing detail (cost breakdown, price index, walking distance, price history chart, gated contact, scam banner, approx map). Not yet sent to frontend testing agent (awaiting user permission)."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus: []
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    -agent: "main"
    -message: "Slice 1 marketplace built with a MOCKED in-memory API (no MongoDB, no external calls). Please test all /api endpoints. MOST CRITICAL: contact gating — assert that NO listing list/detail response ever contains a phone number or exact latitude/longitude; phones must only come from POST /api/reveal when signedIn+studentId provided, and the 16th reveal for the same studentId in a day must return 429. Also verify METU (odtu-kuzey-kibris) is excluded from /api/config universities (unverified coordinates) but present in all_universities. Base URL: use the app's /api prefix."
    -agent: "testing"
    -message: "✅ ALL BACKEND TESTS PASSED (7/7 test groups). Comprehensive testing completed for all API endpoints. CRITICAL CONTACT GATING verified: NO phone numbers or exact coordinates in listings/detail responses. Phone numbers only revealed via POST /api/reveal with proper auth. Rate limiting working (15 requests OK, 16th returns 429). METU exclusion verified in /api/config. All filters, sorting, and error handling working correctly. Backend is production-ready."
