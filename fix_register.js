const fs = require('fs');
const p = 'C:/Users/mswin/OneDrive/Documents/ADCode Projects/premium-cinematic-website-nebula/js/register.js';
let c = fs.readFileSync(p, 'utf8');

// Find start of "if (state.step === 5) {"
const startIdx = c.indexOf('    if (state.step === 5) {');
console.log('startIdx:', startIdx);

// Find the end of submit handler - look for "});\n    // Keyboard: Escape closes"
const endIdx = c.indexOf('});\n    // Keyboard: Escape closes', startIdx);
console.log('endIdx:', endIdx);

if (startIdx >= 0 && endIdx > startIdx) {
  const block = c.substring(startIdx, endIdx);
  console.log('Block length:', block.length);
  console.log('--- First 400 chars ---');
  console.log(block.substring(0, 400));
  console.log('--- Last 200 chars ---');
  console.log(block.substring(block.length - 200));
  
  // Check if payment code is inside if (state.step === 5)
  const paymentIdx = block.indexOf('if (state.step === 6)');
  console.log('Payment block inside if (state.step === 5):', paymentIdx > 0);
  
  // Extract the payment submission code (lines 541-591 in original)
  // It's everything from "if (state.step === 6) {" to "});"
  const paymentStart = block.indexOf('    if (state.step === 6) {');
  const paymentEnd = block.indexOf('    });\n    $("#reg-form").hidden = true;');
  console.log('paymentStart:', paymentStart);
  console.log('paymentEnd:', paymentEnd);
  
  if (paymentStart >= 0 && endIdx > paymentStart) {
    const paymentBlock = block.substring(paymentStart, endIdx + '});\n    $("#reg-form").hidden = true;'.length);
    console.log('Payment block length:', paymentBlock.length);
    console.log(paymentBlock);
  }
}
