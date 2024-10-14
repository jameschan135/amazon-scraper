import React, { useState, useEffect, useCallback } from 'react';
import './AmazonScraperTab.css';
import { getAmazonProductInfo } from '../utils/amazonScraper';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';

function parseVariants(variantsString) {
  const variants = {
    'Flavor Name': '',
    'Size': '',
    'Color': '',
    'Style': '',
    'Unknown': ''
  };
  const lines = variantsString.split('\n');
  let currentLabel = '';

  for (const line of lines) {
    if (line.startsWith('LABEL:')) {
      currentLabel = line.split(':')[1].trim().replace(':', '');
    } else if (line.startsWith('SELECTION:') && currentLabel) {
      const selection = line.split(':')[1].trim();
      switch (currentLabel) {
        case 'Flavor Name':
        case 'Size':
        case 'Color':
        case 'Style':
          variants[currentLabel] = selection;
          break;
        default:
          variants['Unknown'] += `${currentLabel}: ${selection}; `;
      }
    }
  }
  return variants;
}

function AmazonScraperTab() {
  const [singleASIN, setSingleASIN] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [niche, setNiche] = useState('');
  const [thread, setThread] = useState('');
  const [result, setResult] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [productInfo, setProductInfo] = useState(null);
  const [downloadLinks, setDownloadLinks] = useState({});
  const [excelData, setExcelData] = useState(null);

  const generateDownloadLinks = useCallback(async () => {
    if (!productInfo) return;

    const links = {};

    // Tạo link cho Main Images
    const mainZip = new JSZip();
    for (const url of productInfo.mainImages) {
      const response = await fetch(url);
      const blob = await response.blob();
      const fileName = url.split('/').pop();
      mainZip.file(fileName, blob);
    }
    const mainContent = await mainZip.generateAsync({type: 'blob'});
    links.main = URL.createObjectURL(mainContent);

    // Tạo links cho Variants
    for (const [asin, urls] of Object.entries(productInfo.hiResImages)) {
      const variantZip = new JSZip();
      for (const url of urls) {
        const response = await fetch(url);
        const blob = await response.blob();
        const fileName = url.split('/').pop();
        variantZip.file(fileName, blob);
      }
      const content = await variantZip.generateAsync({type: 'blob'});
      links[asin] = URL.createObjectURL(content);
    }

    setDownloadLinks(links);
  }, [productInfo]);

  useEffect(() => {
    if (productInfo) {
      generateDownloadLinks();
    }
  }, [productInfo, generateDownloadLinks]);

  const handleStart = async () => {
    if (!singleASIN) {
      setResult('Vui lòng nhập ASIN');
      return;
    }

    if (!apiKey) {
      setResult('Vui lòng nhập API key');
      return;
    }

    setIsLoading(true);
    setResult('Đang lấy thông tin sản phẩm...');

    try {
      const info = await getAmazonProductInfo(singleASIN, null, apiKey);
      
      let resultText = `ASIN: ${singleASIN}\n` +
                       `Tiêu đề: ${info.title}\n` +
                       `Giá: ${info.price}\n` +
                       `Stock: ${info.stockStatus}\n` +
                       `Ships from: ${info.shipsFrom}\n` +
                       `Sold by: ${info.soldBy}\n` +
                       `Thông tin giao hàng chính: ${info.primaryDeliveryInfo}\n` +
                       `Thông tin giao hàng phụ: ${info.secondaryDeliveryInfo}\n` +
                       `Check Prime Member: ${info.checkPrimeMember}\n\n`;

      // Thêm mô tả sách vào resultText nếu có
      if (info.bookDescription) {
        resultText += `Mô tả sách:\n${info.bookDescription}\n\n`;
      }

      // Hiển thị tất cả thông tin có sẵn
      if (info.ingredients1) {
        resultText += `Ingredients:\n${info.ingredients1}\n\n`;
      }
      if (info.itemDetails) {
        resultText += `Item Details:\n${info.itemDetails}\n\n`;
      }
      if (info.description) {
        resultText += `Description:\n${info.description}\n\n`;
      }
      if (info.itemDetails2) {
        resultText += `Item Details 2:\n${info.itemDetails2}\n\n`;
      }
      if (info.technicalDetails) {
        resultText += `Technical Details:\n`;
        for (const [key, value] of Object.entries(info.technicalDetails)) {
          resultText += `${key}: ${value}\n`;
        }
        resultText += '\n';
      }
      if (info.moreTechnicalDetails) {
        resultText += `More Technical Details:\n`;
        for (const [key, value] of Object.entries(info.moreTechnicalDetails)) {
          resultText += `${key}: ${value}\n`;
        }
        resultText += '\n';
      }

      resultText += `Variants:\n${info.variants}\n\n`;
      resultText += `Main Images (hiRes):\n${info.mainImages.join('\n')}\n\n`;
      resultText += `Hình ảnh hiRes theo ASIN:\n`;
      for (const [asin, urls] of Object.entries(info.hiResImages)) {
        resultText += `ASIN: ${asin}\n${urls.join('\n')}\n\n`;
      }

      setResult(resultText);
      setProductInfo(info);
      setExcelData(info);
    } catch (error) {
      setResult('Có lỗi xảy ra khi lấy thông tin sản phẩm');
      setExcelData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = () => {
    // Logic khi dừng scraping
    console.log('Dừng scraping');
  };

  const handleDownload = async () => {
    if (!productInfo) {
      alert('Không có dữ liệu để tải xuống. Vui lòng thực hiện scraping trước.');
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Product Info');

    // Tiêu đề cơ bản
    let baseHeaders = [
      'Category', 'Sub-category', 'ASIN', 'Title', 'Link', 'Price',
      'Flavor Name', 'Size', 'Color', 'Style', 'Unknown', 'Price Listing',  // Thêm 'Price Listing'
      'Free Deli Day', 'Prime Deli Day', 'Is Prime', 
      'Stock Status', 'Ships From', 'Sold By', 'Description', 'UPC', 'Brand', 'Manufacturer', 'Ingredients', 'Weight', 'Length', 'Width', 'Height', 
      'Item Form', 'Product Benefits', 'Scent', 'Material Type', 'Skin Type','Item Volume','Age Range','Special Feature',
      'Publisher','Language','Paperback','Hardcover','ISBN-10','ISBN-13'
    ];

    // Tìm số lượng hình ảnh lớn nhất
    const maxImageCount = Math.max(
      productInfo.mainImages.length,
      ...Object.values(productInfo.hiResImages).map(images => images.length)
    );

    // Thêm tiêu đề cho các cột hình ảnh
    for (let i = 1; i <= maxImageCount; i++) {
      baseHeaders.push(i === 1 ? 'Main Image' : `Image ${i}`);
    }

    // Thêm hàng tiêu đề
    worksheet.addRow(baseHeaders);

    // Parse variants
    const variantData = parseVariants(productInfo.variants);

    // Hàm helper để tìm và làm sạch giá trị
    const findAndCleanValue = (key, itemDetails2, technicalDetails, itemDetails) => {
      let value;
      
      const searchKey = (obj, targetKey) => {
        if (!obj) return null;
        for (let k in obj) {
          if (k.toLowerCase().includes(targetKey.toLowerCase())) {
            return obj[k];
          }
        }
        return null;
      };

      // Tìm trong itemDetails2
      if (itemDetails2) {
        const match = itemDetails2.match(new RegExp(`${key}.*?:(.+)`));
        if (match) {
          value = match[1].trim();
        } else {
          // Tìm kiếm mở rộng cho Brand và Manufacturer
          const lines = itemDetails2.split('\n');
          for (let line of lines) {
            if (line.toLowerCase().includes(key.toLowerCase())) {
              const parts = line.split(':');
              if (parts.length > 1) {
                value = parts[1].trim();
                break;
              }
            }
          }
        }
      }
      
      // Nếu không tìm thấy trong itemDetails2, tìm trong technicalDetails
      if (!value) {
        value = searchKey(technicalDetails, key);
      }
      
      // Nếu vẫn không tìm thấy, tìm trong itemDetails
      if (!value && itemDetails) {
        const match = itemDetails.match(new RegExp(`${key}.*?:(.+)`));
        if (match) {
          value = match[1].trim();
        } else {
          // Tìm kiếm mở rộng cho Brand và Manufacturer
          const lines = itemDetails.split('\n');
          for (let line of lines) {
            if (line.toLowerCase().includes(key.toLowerCase())) {
              const parts = line.split(':');
              if (parts.length > 1) {
                value = parts[1].trim();
                break;
              }
            }
          }
        }
      }
      
      // Nếu tìm thấy giá trị, làm sạch nó
      if (value) {
        return value.replace(/^[\s:‏‎]+/, '').replace(/^&lrm;/, '');
      }
      
      return `Không Thấy ${key}`;
    };

    // Tìm giá trị UPC, Brand và Manufacturer
    let upcValue = findAndCleanValue('UPC', productInfo.itemDetails2, productInfo.technicalDetails, productInfo.itemDetails);
    let brandValue = findAndCleanValue('Brand', productInfo.itemDetails2, productInfo.technicalDetails, productInfo.itemDetails);
    let manufacturerValue = findAndCleanValue('Manufacturer', productInfo.itemDetails2, productInfo.technicalDetails, productInfo.itemDetails);

    // Chuẩn bị dữ liệu cho hàng
    const price = parseFloat(productInfo.price.replace('$', '')) || 0;
    const priceListing = (price * 1.5).toFixed(2);

    let weightValue = findWeightValue(
      productInfo.itemDetails, 
      productInfo.itemDetails2, 
      productInfo.technicalDetails
    );

    const { length, width, height } = extractDimensions(
      productInfo.itemDetails2, 
      productInfo.technicalDetails
    );

    let itemFormValue = findItemForm(
      productInfo.itemDetails, 
      productInfo.itemDetails2, 
      productInfo.technicalDetails
    );

    let productBenefitsValue = findProductBenefits(
      productInfo.itemDetails, 
      productInfo.itemDetails2, 
      productInfo.technicalDetails
    );

    let scentValue = findScent(
      productInfo.itemDetails, 
      productInfo.itemDetails2, 
      productInfo.technicalDetails
    );

    let materialTypeValue = findMaterialType(
      productInfo.itemDetails, 
      productInfo.itemDetails2, 
      productInfo.technicalDetails
    );

    let skinTypeValue = findSkinType(
      productInfo.itemDetails, 
      productInfo.itemDetails2, 
      productInfo.technicalDetails
    );

    let itemVolumeValue = findItemVolume(
      productInfo.itemDetails, 
      productInfo.itemDetails2, 
      productInfo.technicalDetails
    );

    let ageRangeValue = findAgeRange(
      productInfo.itemDetails, 
      productInfo.itemDetails2, 
      productInfo.technicalDetails
    );

    let specialFeatureValue = findSpecialFeature(
      productInfo.itemDetails, 
      productInfo.itemDetails2, 
      productInfo.technicalDetails
    );

    let publisherValue = findPublisher(
      productInfo.itemDetails, 
      productInfo.itemDetails2, 
      productInfo.technicalDetails
    );

    let languageValue = findLanguage(
      productInfo.itemDetails, 
      productInfo.itemDetails2, 
      productInfo.technicalDetails
    );

    let paperbackValue = findPaperback(
      productInfo.itemDetails, 
      productInfo.itemDetails2, 
      productInfo.technicalDetails
    );

    let hardcoverValue = findHardcover(
      productInfo.itemDetails, 
      productInfo.itemDetails2, 
      productInfo.technicalDetails
    );

    let isbn10Value = findISBN10(
      productInfo.itemDetails, 
      productInfo.itemDetails2, 
      productInfo.technicalDetails
    );

    let isbn13Value = findISBN13(
      productInfo.itemDetails, 
      productInfo.itemDetails2, 
      productInfo.technicalDetails
    );

    let baseRowData = [
      productInfo.category,
      productInfo.subCategory,
      productInfo.mainImageAsin,
      productInfo.title,
      `https://www.amazon.com/dp/${productInfo.mainImageAsin}`,
      price.toFixed(2),
      variantData['Flavor Name'] || '',
      variantData['Size'] || '',
      variantData['Color'] || '',
      variantData['Style'] || '',
      variantData['Unknown'] || '',
      priceListing,
      productInfo.primaryDeliveryInfo,
      productInfo.secondaryDeliveryInfo,
      productInfo.checkPrimeMember,
      productInfo.stockStatus,
      productInfo.shipsFrom,
      productInfo.soldBy,
      productInfo.bookDescription || productInfo.description || '',
      upcValue,
      brandValue,
      manufacturerValue,
      productInfo.ingredients1 || '',
      weightValue,
      length,
      width,
      height,
      itemFormValue,
      productBenefitsValue,
      scentValue,
      materialTypeValue,
      skinTypeValue,
      itemVolumeValue,
      ageRangeValue,
      specialFeatureValue,
      publisherValue,
      languageValue,
      paperbackValue,
      hardcoverValue,
      isbn10Value,
      isbn13Value
    ];



    // Thêm URL hình ảnh cho sản phẩm chính
    for (let i = 0; i < maxImageCount; i++) {
      baseRowData.push(productInfo.mainImages[i] || '');
    }
    // Thêm hàng dữ liệu
    const dataRow = worksheet.addRow(baseRowData);

    // Xử lý và thêm dữ liệu cho các biến thể
    const variantAsins = new Set();
    const variantLines = productInfo.variants.split('\n');
    for (const line of variantLines) {
      if (line.startsWith('ASIN:')) {
        const asin = line.split(':')[1].trim();
        if (asin && asin !== productInfo.mainImageAsin) {
          variantAsins.add(asin);
        }
      }
    }

    // Thêm các dòng mới cho ASIN của variants
    for (const asin of variantAsins) {
      const variantRow = new Array(baseHeaders.length).fill('');
      variantRow[baseHeaders.indexOf('ASIN')] = asin;
      
      // Thêm URL hình ảnh cho biến thể
      const variantImages = productInfo.hiResImages[asin] || [];
      for (let i = 0; i < maxImageCount; i++) {
        variantRow[baseHeaders.indexOf('Main Image') + i] = variantImages[i] || '';
      }
      
      worksheet.addRow(variantRow);
    }

    // Tạo hyperlink cho cột Link
    const linkCell = dataRow.getCell(5); // Cột Link là cột thứ 5
    linkCell.value = {
      text: `https://www.amazon.com/dp/${productInfo.mainImageAsin}`,
      hyperlink: `https://www.amazon.com/dp/${productInfo.mainImageAsin}`,
      type: 'hyperlink'
    };

    // Định dạng tiêu đề
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    // Tự động điều chỉnh độ rộng cột
    worksheet.columns.forEach(column => {
      //column.width = Math.max(15, ...worksheet.getColumn(column.letter).values.map(v => v ? v.toString().length : 0));
      column.width = 20;
    });

    // Tạo buffer và tải xuống
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const unixTime = Math.floor(Date.now() / 1000);
    link.download = `amazon_scrape_${unixTime}.xlsx`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const findWeightValue = (itemDetails, itemDetails2, technicalDetails) => {
    const searchWeight = (obj) => {
      if (typeof obj === 'string') {
        const lines = obj.split('\n');
        for (let line of lines) {
          if (line.toLowerCase().includes('weight')) {
            return line.split(':')[1].trim();
          }
        }
      } else if (typeof obj === 'object') {
        for (let key in obj) {
          if (key.toLowerCase().includes('weight')) {
            return obj[key];
          }
        }
      }
      return null;
    };

    const extractWeight = (value) => {
      if (typeof value === 'string') {
        // Tìm kiếm các đơn vị trọng lượng phổ biến
        const weightMatch = value.match(/(\d+(\.\d+)?)\s*(ounces|pounds|grams|kilograms|oz|lbs|g|kg)/i);
        if (weightMatch) {
          return weightMatch[0];
        }
      }
      return null;
    };

    let weight = searchWeight(itemDetails) || searchWeight(itemDetails2) || searchWeight(technicalDetails);
    weight = extractWeight(weight);

    if (!weight) {
      // Nếu không tìm thấy trọng lượng, thử tìm trong dimensions
      const dimensions = extractDimensions(itemDetails2, technicalDetails);
      if (dimensions.weight) {
        weight = dimensions.weight;
      }
    }

    return weight || 'Không tìm thấy thông tin về trọng lượng';
  };

  const extractDimensions = (itemDetails2, technicalDetails) => {
    const searchDimensions = (obj) => {
      if (typeof obj === 'string') {
        const lines = obj.split('\n');
        for (let line of lines) {
          if (line.toLowerCase().includes('dimensions') || line.toLowerCase().includes('package dimensions')) {
            return line.split(':')[1].trim();
          }
        }
      } else if (typeof obj === 'object') {
        for (let key in obj) {
          if (key.toLowerCase().includes('dimensions') || key.toLowerCase().includes('package dimensions')) {
            return obj[key];
          }
        }
      }
      return null;
    };

    const dimensions = searchDimensions(itemDetails2) || searchDimensions(technicalDetails);
    if (dimensions) {
      const match = dimensions.match(/(\d+(\.\d+)?)\s*x\s*(\d+(\.\d+)?)\s*x\s*(\d+(\.\d+)?)/);
      const weightMatch = dimensions.match(/(\d+(\.\d+)?)\s*(ounces|pounds|grams|kilograms|oz|lbs|g|kg)/i);
      return {
        length: match ? match[1] : '',
        width: match ? match[3] : '',
        height: match ? match[5] : '',
        weight: weightMatch ? weightMatch[0] : ''
      };
    }
    return { length: '', width: '', height: '', weight: '' };
  };

  const findItemForm = (itemDetails, itemDetails2, technicalDetails) => {
    const searchItemForm = (obj) => {
      if (typeof obj === 'string') {
        const lines = obj.split('\n');
        for (let line of lines) {
          if (line.toLowerCase().includes('item form') || line.toLowerCase().includes('form factor')) {
            return line.split(':')[1].trim();
          }
        }
      } else if (typeof obj === 'object') {
        for (let key in obj) {
          if (key.toLowerCase().includes('item form') || key.toLowerCase().includes('form factor')) {
            return obj[key];
          }
        }
      }
      return null;
    };

    return searchItemForm(itemDetails) || searchItemForm(itemDetails2) || searchItemForm(technicalDetails) || 'Không tìm thấy thông tin về Item Form';
  };

  const findProductBenefits = (itemDetails, itemDetails2, technicalDetails) => {
    const searchProductBenefits = (obj) => {
      if (typeof obj === 'string') {
        const lines = obj.split('\n');
        for (let line of lines) {
          if (line.toLowerCase().includes('product benefits') || line.toLowerCase().includes('benefits')) {
            return line.split(':')[1].trim();
          }
        }
      } else if (typeof obj === 'object') {
        for (let key in obj) {
          if (key.toLowerCase().includes('product benefits') || key.toLowerCase().includes('benefits')) {
            return obj[key];
          }
        }
      }
      return null;
    };

    return searchProductBenefits(itemDetails) || searchProductBenefits(itemDetails2) || searchProductBenefits(technicalDetails) || 'Không tìm thấy thông tin về Product Benefits';
  };

  const findScent = (itemDetails, itemDetails2, technicalDetails) => {
    const searchScent = (obj) => {
      if (typeof obj === 'string') {
        const lines = obj.split('\n');
        for (let line of lines) {
          if (line.toLowerCase().includes('scent')) {
            return line.split(':')[1].trim();
          }
        }
      } else if (typeof obj === 'object') { 
        for (let key in obj) {
          if (key.toLowerCase().includes('scent')) {
            return obj[key];
          }
        }
      }
      return null;
    };

    return searchScent(itemDetails) || searchScent(itemDetails2) || searchScent(technicalDetails) || 'Không tìm thấy thông tin về Scent';
  };

  const findMaterialType = (itemDetails, itemDetails2, technicalDetails) => {
    const searchMaterialType = (obj) => {
      if (typeof obj === 'string') {
        const lines = obj.split('\n');
        for (let line of lines) {
          if (line.toLowerCase().includes('material type')) {
            return line.split(':')[1].trim();
          }
        }
      } else if (typeof obj === 'object') {
        for (let key in obj) {
          if (key.toLowerCase().includes('material type')) {
            return obj[key];
          }
        }
      }
      return null;
    };

    return searchMaterialType(itemDetails) || searchMaterialType(itemDetails2) || searchMaterialType(technicalDetails) || 'Không tìm thấy thông tin về Material Type';
  };

  const findSkinType = (itemDetails, itemDetails2, technicalDetails) => {
    const searchSkinType = (obj) => {
      if (typeof obj === 'string') {
        const lines = obj.split('\n');
        for (let line of lines) {
          if (line.toLowerCase().includes('skin type')) {
            return line.split(':')[1].trim();
          }
        }
      } else if (typeof obj === 'object') {
        for (let key in obj) {
          if (key.toLowerCase().includes('skin type')) {
            return obj[key];
          }
        }
      }
      return null;
    };

    return searchSkinType(itemDetails) || searchSkinType(itemDetails2) || searchSkinType(technicalDetails) || '';
  };  

  const findItemVolume = (itemDetails, itemDetails2, technicalDetails) => {
    const searchItemVolume = (obj) => {
      if (typeof obj === 'string') {
        const lines = obj.split('\n');
        for (let line of lines) {
          if (line.toLowerCase().includes('item volume')) {
            return line.split(':')[1].trim();
          }
        }
      } else if (typeof obj === 'object') {
        for (let key in obj) {
          if (key.toLowerCase().includes('item volume')) {
            return obj[key];
          }
        }
      }
      return null;
    };

    return searchItemVolume(itemDetails) || searchItemVolume(itemDetails2) || searchItemVolume(technicalDetails) || '';
  };

  const findAgeRange = (itemDetails, itemDetails2, technicalDetails) => {
    const searchAgeRange = (obj) => {
      if (typeof obj === 'string') {
        const lines = obj.split('\n');
        for (let line of lines) {
          if (line.toLowerCase().includes('age range')) {
            return line.split(':')[1].trim();
          }
        }
      } else if (typeof obj === 'object') {
        for (let key in obj) {
          if (key.toLowerCase().includes('age range')) {
            return obj[key];
          }
        }
      }
      return null;
    };

    return searchAgeRange(itemDetails) || searchAgeRange(itemDetails2) || searchAgeRange(technicalDetails) || '';
  };

  const findSpecialFeature = (itemDetails, itemDetails2, technicalDetails) => {
    const searchSpecialFeature = (obj) => {
      if (typeof obj === 'string') {
        const lines = obj.split('\n');
        for (let line of lines) {
          if (line.toLowerCase().includes('special feature')) {
            return line.split(':')[1].trim();
          }
        }
      } else if (typeof obj === 'object') {
        for (let key in obj) {
          if (key.toLowerCase().includes('special feature')) {
            return obj[key];
          }
        }
      }
      return null;
    };

    return searchSpecialFeature(itemDetails) || searchSpecialFeature(itemDetails2) || searchSpecialFeature(technicalDetails) || '';
  };

  const findLanguage = (itemDetails, itemDetails2, technicalDetails) => {
    const searchLanguage = (obj) => {
      if (typeof obj === 'string') {
        const lines = obj.split('\n');
        for (let line of lines) {
          if (line.toLowerCase().includes('language')) {
            return line.split(':')[1].trim();
          }
        }
      } else if (typeof obj === 'object') {
        for (let key in obj) {
          if (key.toLowerCase().includes('language')) {
            return obj[key];
          }
        }
      }
      return null;
    };

    return searchLanguage(itemDetails) || searchLanguage(itemDetails2) || searchLanguage(technicalDetails) || '';
  };

  const findPublisher = (itemDetails, itemDetails2, technicalDetails) => {
    const searchPublisher = (obj) => {
      if (typeof obj === 'string') {
        const lines = obj.split('\n');
        for (let line of lines) {
          if (line.toLowerCase().includes('publisher')) {
            return line.split(':')[1].trim();
          }
        }
      } else if (typeof obj === 'object') {
        for (let key in obj) {
          if (key.toLowerCase().includes('publisher')) {
            return obj[key];
          }
        }
      }
      return null;
    };

    return searchPublisher(itemDetails) || searchPublisher(itemDetails2) || searchPublisher(technicalDetails) || '';
  };

  const findPaperback = (itemDetails, itemDetails2, technicalDetails) => {
    const searchPaperback = (obj) => {
      if (typeof obj === 'string') {
        const lines = obj.split('\n');
        for (let line of lines) {
          if (line.toLowerCase().includes('paperback')) {
            return line.split(':')[1].trim();
          }
        }
      } else if (typeof obj === 'object') {
        for (let key in obj) {
          if (key.toLowerCase().includes('paperback')) {
            return obj[key];
          }
        }
      }
      return null;  
    };

    return searchPaperback(itemDetails) || searchPaperback(itemDetails2) || searchPaperback(technicalDetails) || '';
  };

  const findHardcover = (itemDetails, itemDetails2, technicalDetails) => {
    const searchHardcover = (obj) => {
      if (typeof obj === 'string') {
        const lines = obj.split('\n');
        for (let line of lines) {
          if (line.toLowerCase().includes('hardcover')) {
            return line.split(':')[1].trim();
          }
        } 
      } else if (typeof obj === 'object') {
        for (let key in obj) {
          if (key.toLowerCase().includes('hardcover')) {
            return obj[key];
          }
        }
      }
      return null;
    };  

    return searchHardcover(itemDetails) || searchHardcover(itemDetails2) || searchHardcover(technicalDetails) || '';
  };

  const findISBN10 = (itemDetails, itemDetails2, technicalDetails) => {
    const searchISBN10 = (obj) => {
      if (typeof obj === 'string') {
        const lines = obj.split('\n');
        for (let line of lines) {
          if (line.toLowerCase().includes('isbn-10')) {
            return line.split(':')[1].trim();
          }
        }
      } else if (typeof obj === 'object') {   
        for (let key in obj) {
          if (key.toLowerCase().includes('isbn-10')) {
            return obj[key];
          }
        }
      }
      return null;    
    };

    return searchISBN10(itemDetails) || searchISBN10(itemDetails2) || searchISBN10(technicalDetails) || '';
  };

  const findISBN13 = (itemDetails, itemDetails2, technicalDetails) => {
    const searchISBN13 = (obj) => {
      if (typeof obj === 'string') {
        const lines = obj.split('\n');
        for (let line of lines) {
          if (line.toLowerCase().includes('isbn-13')) {
            return line.split(':')[1].trim();
          }
        }
      } else if (typeof obj === 'object') {
        for (let key in obj) {
          if (key.toLowerCase().includes('isbn-13')) {
            return obj[key];
          }
        }
      } 
      return null;
    };

    return searchISBN13(itemDetails) || searchISBN13(itemDetails2) || searchISBN13(technicalDetails) || '';
  };

  return (
    <div className="amazon-scraper-tab">
      <h2>Amazon Scraper</h2>
      
      <div className="input-container">
        <label htmlFor="api-key-input">API Key:</label>
        <input 
          id="api-key-input"
          type="text" 
          value={apiKey} 
          onChange={(e) => setApiKey(e.target.value)} 
          placeholder="Nhập API key"
        />
      </div>

      <div className="single-asin-input">
        <input 
          type="text" 
          value={singleASIN} 
          onChange={(e) => setSingleASIN(e.target.value)} 
          placeholder="Nhập ASIN"
        />
      </div>


      <div className="action-buttons">
        <button onClick={handleStart} disabled={isLoading}>
          {isLoading ? 'Đang xử lý...' : 'Bắt Đầu'}
        </button>
        <button onClick={handleStop}>Dừng</button>
        <button onClick={handleDownload} disabled={!productInfo}>Tải Kết Quả</button>
      </div>

      <div className="result-area">
        <h3>Trả Kết Quả</h3>
        <textarea value={result} readOnly />
      </div>

      {productInfo && (
        <div className="download-section">
          <h3>Tải ảnh:</h3>
          <table className="image-table">
            <thead>
              <tr>
                <th>Ảnh</th>
                <th>ASIN | Variant</th>
                <th>Tải ảnh</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><img src={productInfo.mainImages[0]} alt="Main" className="thumbnail" /></td>
                <td>{`${productInfo.mainImageAsin}`}</td>
                <td>
                  <a 
                    href={downloadLinks.main} 
                    download={`${productInfo.mainImageAsin}.zip`}
                  >
                    Tải tất cả ảnh
                  </a>
                </td>
              </tr>
            </tbody>
          </table>

          <h3>Tải ảnh biến th:</h3>
          <table className="image-table">
            <thead>
              <tr>
                <th>Ảnh</th>
                <th>ASIN | Variant</th>
                <th>Tải ảnh</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const variants = parseVariants(productInfo.variants);
                return Object.entries(productInfo.hiResImages).map(([asin, urls]) => (
                  <tr key={asin}>
                    <td><img src={urls[0]} alt={`Variant ${asin}`} className="thumbnail" /></td>
                    <td>{`${asin}`}</td>
                    <td>
                      <a href={downloadLinks[asin]} download={`${asin}.zip`}>
                        Tải tất cả ảnh
                      </a>
                    </td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default AmazonScraperTab;