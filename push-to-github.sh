#!/bin/bash

echo "🚀 Pushing ERP Testing Backend to GitHub..."
echo "Repository: https://github.com/MohamedMagdy90/erp-testing-backend"
echo ""

# Push to GitHub (will prompt for credentials if needed)
git push -u origin main --force

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Successfully pushed to GitHub!"
    echo "🔗 Repository: https://github.com/MohamedMagdy90/erp-testing-backend"
    echo ""
    echo "📋 Next Steps:"
    echo "1. Deploy on Render.com"
    echo "2. Set environment variables:"
    echo "   - JWT_SECRET=your-secure-secret-key"
    echo "   - NODE_ENV=production"
    echo "3. Update frontend API URL to your Render URL"
else
    echo ""
    echo "⚠️ Push failed. Please try one of these options:"
    echo ""
    echo "Option 1: Use GitHub Personal Access Token"
    echo "  1. Create token at: https://github.com/settings/tokens"
    echo "  2. Run: git remote set-url origin https://YOUR_TOKEN@github.com/MohamedMagdy90/erp-testing-backend.git"
    echo "  3. Run: git push -u origin main --force"
    echo ""
    echo "Option 2: Use SSH"
    echo "  1. Set up SSH key: https://github.com/settings/keys"
    echo "  2. Run: git remote set-url origin git@github.com:MohamedMagdy90/erp-testing-backend.git"
    echo "  3. Run: git push -u origin main --force"
fi
