// QR Studio — public serial verification.
// Calls the `verify_serial` PostgREST RPC (security definer) using the anon key.
// Update the URL/anon key below if you change your Supabase project.
(function () {
  var SUPABASE_URL = 'https://supabase2.kajariabathware.in';
  var SUPABASE_ANON_KEY = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc4NzQ4MDg4MCwiZXhwIjo0OTQzMTU0NDgwLCJyb2xlIjoiYW5vbiJ9.o7JoSXeLTJOORJGAs_qjjChKNTHPl9c-1UBb5R1fFGs';

  var input = document.getElementById('sn');
  var btn = document.getElementById('btn');
  var result = document.getElementById('result');

  function show(ok, html) {
    result.className = 'result ' + (ok ? 'ok' : 'bad');
    result.innerHTML = html;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  async function verify() {
    var sn = (input.value || '').trim();
    if (!sn) { show(false, 'Please enter a serial number.'); return; }
    btn.disabled = true; btn.textContent = 'Checking…';
    try {
      var res = await fetch(SUPABASE_URL + '/rest/v1/rpc/verify_serial', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ sn: sn })
      });
      if (!res.ok) throw new Error('Service error (' + res.status + ')');
      var data = await res.json();
      if (data && data.valid) {
        show(true,
          '<div style="font-weight:800;margin-bottom:6px;">✔ Valid — genuine product</div>' +
          '<div class="row"><span>Serial</span><b>' + esc(data.serial_number) + '</b></div>' +
          '<div class="row"><span>Product</span><b>' + esc(data.product) + '</b></div>' +
          '<div class="row"><span>SKU</span><b>' + esc(data.sku) + '</b></div>' +
          '<div class="row"><span>Plant</span><b>' + esc(data.plant) + '</b></div>' +
          '<div class="row"><span>Status</span><b>' + esc(data.status) + '</b></div>');
      } else {
        show(false, '<div style="font-weight:800;margin-bottom:6px;">✖ Not found / invalid</div>' +
          '<div>This serial number could not be verified.</div>');
      }
    } catch (e) {
      show(false, 'Could not verify. Please try again later.<div style="font-size:.75rem;margin-top:4px;">' + esc(e.message || e) + '</div>');
    } finally {
      btn.disabled = false; btn.textContent = 'Verify';
    }
  }

  btn.addEventListener('click', verify);
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') verify(); });

  // Pre-fill from ?sn= or ?serial= query param
  var qs = new URLSearchParams(window.location.search);
  var fromUrl = qs.get('sn') || qs.get('serial');
  if (fromUrl) { input.value = fromUrl; verify(); }
})();
