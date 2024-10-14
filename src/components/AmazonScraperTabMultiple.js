import React, { useState, useRef, useCallback } from 'react';
//import './AmazonScraperTabMultiple.css'; // Tạo file CSS riêng cho component này
//import { useWorker } from 'react-hooks-worker';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

function AmazonScraperTabMultiple() {
  const [asinInput, setAsinInput] = useState('');
  const [threadCount, setThreadCount] = useState(1);
  const [apiKey, setApiKey] = useState(''); // Thêm state cho API Key
  const [result, setResult] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [scrapedData, setScrapedData] = useState([]);
  const abortControllerRef = useRef(null);

  const createWorker = () => new Worker(new URL('../workers/amazonScraperWorker.js', import.meta.url));

  const handleInputChange = (event) => {
    setAsinInput(event.target.value);
  };

  const handleThreadCountChange = (event) => {
    const value = parseInt(event.target.value, 10);
    setThreadCount(isNaN(value) ? 1 : Math.max(1, value));
  };

  const processAsinOrUrl = useCallback(async (asinOrUrl) => {
    return new Promise((resolve, reject) => {
      const worker = createWorker();
      worker.onmessage = (event) => {
        if (event.data.type === 'success') {
          resolve(event.data.info);
        } else {
          reject(new Error(event.data.error));
        }
      };
      worker.postMessage({ asinOrUrl, apiKey });
    });
  }, [apiKey]);

  const handleStart = async () => {
    if (!asinInput.trim()) {
      setResult('Vui lòng nhập danh sách ASIN hoặc URL sản phẩm Amazon');
      return;
    }

    if (!apiKey.trim()) {
      setResult('Vui lòng nhập API Key');
      return;
    }

    setIsProcessing(true);
    setResult('Đang xử lý danh sách ASIN/URL...\n');
    abortControllerRef.current = new AbortController();

    const asinOrUrlList = asinInput.split(/[\s,]+/).filter(item => item.trim() !== '');

    const allResults = [];

    try {
      for (let i = 0; i < asinOrUrlList.length; i += threadCount) {
        if (abortControllerRef.current.signal.aborted) {
          break;
        }
        const batch = asinOrUrlList.slice(i, i + threadCount);
        const batchResults = await processBatch(batch);
        allResults.push(...batchResults);
      }
      setResult(prevResult => prevResult + 'Đã xử lý xong tất cả ASIN/URL\n');
      setScrapedData(allResults);
    } catch (error) {
      if (error.name === 'AbortError') {
        setResult(prevResult => prevResult + 'Quá trình xử lý đã bị dừng\n');
      } else {
        setResult(prevResult => prevResult + 'Có lỗi xảy ra khi xử lý ASIN/URL\n');
        console.error('Lỗi:', error);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const processBatch = async (batch) => {
    const results = await Promise.all(
      batch.map(async (asinOrUrl) => {
        try {
          setResult(prevResult => prevResult + `Đang xử lý: ${asinOrUrl}\n`);
          const info = await processAsinOrUrl(asinOrUrl);
          setResult(prevResult => prevResult + `Đã xử lý xong: ${asinOrUrl}\n`);
          return { asinOrUrl, info, error: null };
        } catch (error) {
          setResult(prevResult => prevResult + `Lỗi khi xử lý ${asinOrUrl}: ${error.message}\n`);
          return { asinOrUrl, info: null, error: error.message };
        }
      })
    );

    results.forEach(({ asinOrUrl, info, error }) => {
      if (error) {
        setResult(prevResult => prevResult + `${asinOrUrl} gặp lỗi: ${error}\n\n`);
      } else {
        setResult(prevResult => prevResult + `${asinOrUrl}:\n${JSON.stringify(info, null, 2)}\n\n`);
      }
    });

    return results;
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsProcessing(false);
  };

  const handleDownload = async () => {
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Amazon Scrape Results');

    // Tìm số lượng hình ảnh lớn nhất
    const maxImageCount = Math.max(
      ...scrapedData.map(item => 
        Math.max(
          item.info?.mainImages?.length || 0,
          ...Object.values(item.info?.hiResImages || {}).map(images => images.length)
        )
      )
    );

    const baseHeaders = [
      'Category', 'Sub-category', 'ASIN', 'Title', 'Link', 'Price',
      'Flavor Name', 'Size', 'Color', 'Style', 'Unknown', 'Price Listing',
      'Free Deli Day', 'Prime Deli Day', 'Is Prime', 
      'Stock Status', 'Ships From', 'Sold By', 'Description', 'UPC', 'Brand', 'Manufacturer', 'Ingredients', 'Weight', 'Length', 'Width', 'Height', 
      'Item Form', 'Product Benefits', 'Scent', 'Material Type', 'Skin Type', 'Item Volume', 'Age Range', 'Special Feature',
      'Publisher', 'Language', 'Paperback', 'ISBN-10', 'ISBN-13'
    ];

    // Thêm tiêu đề cho các cột hình ảnh
    for (let i = 1; i <= maxImageCount; i++) {
      baseHeaders.push(`Image ${i}`);
    }

    worksheet.columns = baseHeaders.map(header => ({
      header,
      key: header.toLowerCase().replace(/ /g, '_'),
      width: 20
    }));

    scrapedData.forEach((item, index) => {
      const mainRowData = {};
      baseHeaders.forEach(header => {
        const key = header.toLowerCase().replace(/ /g, '_');
        if (key === 'sub-category') {
          const subCategoryKey = Object.keys(item.info || {}).find(k => k.toLowerCase().includes('subcategory'));
          mainRowData[key] = subCategoryKey ? item.info[subCategoryKey] : '';
        } else if (key === 'link') {
          const urlKey = Object.keys(item.info || {}).find(k => k.toLowerCase().includes('url'));
          const url = urlKey ? item.info[urlKey] : '';
          mainRowData[key] = { text: url, hyperlink: url };
        } else if (key === 'price') {
          const price = item.info?.price || '';
          mainRowData[key] = price.replace(/[^0-9.]/g, '');
        } else if(['flavor_name', 'size', 'color', 'style', 'unknown'].includes(key)){
          // Xử lý variants
          const variants = parseVariants(item.info?.variants || '');
          mainRowData[key] = variants[header] || '';
        } else if(key === 'free_deli_day'){
          const freeDeliDay = Object.keys(item.info || {}).find(k => k.toLowerCase().includes('primarydeliveryinfo'));
          mainRowData[key] = freeDeliDay ? item.info[freeDeliDay] : '';
        } else if(key === 'prime_deli_day'){
          const primeDeliDay = Object.keys(item.info || {}).find(k => k.toLowerCase().includes('secondarydeliveryinfo'));
          mainRowData[key] = primeDeliDay ? item.info[primeDeliDay] : '';
        } else if(key === 'is_prime'){
          const isPrime = Object.keys(item.info || {}).find(k => k.toLowerCase().includes('checkprimemember'));
          mainRowData[key] = isPrime ? item.info[isPrime] : '';
        } else if(key === 'stock_status'){
          const stockStatus = Object.keys(item.info || {}).find(k => k.toLowerCase().includes('stockstatus'));
          mainRowData[key] = stockStatus ? item.info[stockStatus] : '';
        } else if(key === 'ships_from'){
          const shipsFrom = Object.keys(item.info || {}).find(k => k.toLowerCase().includes('shipsfrom'));
          mainRowData[key] = shipsFrom ? item.info[shipsFrom] : '';
        } else if(key === 'sold_by'){
          const soldBy = Object.keys(item.info || {}).find(k => k.toLowerCase().includes('soldby'));
          mainRowData[key] = soldBy ? item.info[soldBy] : '';
        } else if(key === 'description'){
          const descriptionKey = Object.keys(item.info || {}).find(k => k.toLowerCase() === 'description');
          const bookDescriptionKey = Object.keys(item.info || {}).find(k => k.toLowerCase() === 'bookdescription');
          
          if (descriptionKey && item.info[descriptionKey]) {
            mainRowData[key] = item.info[descriptionKey];
          } else if (bookDescriptionKey) {
            mainRowData[key] = item.info[bookDescriptionKey];
          } else {
            mainRowData[key] = '';
          }
        } else if(key === 'upc'){
          const upcValue = findUPCValue(item.info);
          mainRowData[key] = upcValue ? cleanValue(upcValue) : '';
        } else if(key === 'brand'){
          const brandValue = findBrandValue(item.info);
          mainRowData[key] = brandValue ? cleanValue(brandValue) : '';
        } else if(key === 'manufacturer'){
          const manufacturerValue = findManufacturerValue(item.info);
          mainRowData[key] = manufacturerValue ? cleanValue(manufacturerValue) : '';
        } else if(key === 'ingredients'){
          const ingredientKey = Object.keys(item.info || {}).find(k => k.toLowerCase().includes('ingredients1'));
          mainRowData[key] = ingredientKey ? item.info[ingredientKey] : '';
        } else if (key === 'weight' || key === 'length' || key === 'width' || key === 'height') {
          const dimensions = extractDimensions(item.info?.itemDetails2, item.info?.technicalDetails, item.info);
          mainRowData[key] = dimensions[key] || '';
        } else if(key === 'item_form'){
          const itemFormValue = findItemFormValue(item.info);
          mainRowData[key] = itemFormValue ? cleanValue(itemFormValue) : '';
        } else if(key === 'product_benefits'){
          const productBenefitsValue = findProductBenefitsValue(item.info);
          mainRowData[key] = productBenefitsValue ? cleanValue(productBenefitsValue) : '';
        } else if(key === 'scent'){
          const scentValue = findScentValue(item.info);
          mainRowData[key] = scentValue ? cleanValue(scentValue) : '';
        } else if(key === 'material_type'){
          const materialTypeValue = findMaterialValue(item.info);
          mainRowData[key] = materialTypeValue ? cleanValue(materialTypeValue) : '';
        } else if(key === 'skin_type'){
          const skinTypeValue = findSkinTypeValue(item.info);
          mainRowData[key] = skinTypeValue ? cleanValue(skinTypeValue) : '';
        } else if(key === 'item_volume'){
          const itemVolumeValue = findItemVolumeValue(item.info);
          mainRowData[key] = itemVolumeValue ? cleanValue(itemVolumeValue) : '';  
        } else if(key === 'age_range'){
          const ageRangeValue = findAgeRangeValue(item.info);
          mainRowData[key] = ageRangeValue ? cleanValue(ageRangeValue) : '';
        } else if(key === 'special_feature'){
          const specialFeatureValue = findSpecialFeaturesValue(item.info);
          mainRowData[key] = specialFeatureValue ? cleanValue(specialFeatureValue) : '';
        } else if(key === 'publisher'){
          const publisherValue = findPublisherValue(item.info);
          mainRowData[key] = publisherValue ? cleanValue(publisherValue) : '';
        } else if(key === 'language'){
          const languageValue = findLanguageValue(item.info);
          mainRowData[key] = languageValue ? cleanValue(languageValue) : '';
        } else if(key === 'paperback'){
          const paperbackValue = findPaperbackValue(item.info);
          mainRowData[key] = paperbackValue ? cleanValue(paperbackValue) : '';
        } else if(key === 'hardcover'){
          const hardcoverValue = findHardcoverValue(item.info);
          mainRowData[key] = hardcoverValue ? cleanValue(hardcoverValue) : '';
        } else if(key === 'isbn-10'){
          const isbn10Value = findISBN10Value(item.info);
          mainRowData[key] = isbn10Value ? cleanValue(isbn10Value) : '';
        } else if(key === 'isbn-13'){
          const isbn13Value = findISBN13Value(item.info);
          mainRowData[key] = isbn13Value ? cleanValue(isbn13Value) : '';
        } else {
          mainRowData[key] = item.info?.[key] || '';
        }
      });

      // Thêm URL hình ảnh cho sản phẩm chính
      const allImages = [...(item.info?.mainImages || []), ...(item.info?.hiResImages?.[item.info?.mainImageAsin] || [])];
      for (let i = 0; i < maxImageCount; i++) {
        mainRowData[`image_${i + 1}`] = allImages[i] || '';
      }

      const mainRow = worksheet.addRow(mainRowData);

      // Định dạng ô Link
      const linkCell = mainRow.getCell('link');
      if (linkCell.value) {
        linkCell.font = { color: { argb: 'FF0000FF' }, underline: true };
      }

      // Định dạng ô Price là số
      const priceCell = mainRow.getCell('price');
      if (priceCell.value) {
        priceCell.numFmt = '0.00';
      }

      // Xử lý và thêm dữ liệu cho các biến thể
      const variantAsins = new Set();
      const variantLines = item.info?.variants?.split('\n') || [];
      for (const line of variantLines) {
        if (line.startsWith('ASIN:')) {
          const asin = line.split(':')[1].trim();
          if (asin && asin !== item.info?.mainImageAsin) {
            variantAsins.add(asin);
          }
        }
      }

      // Thêm các dòng mới cho ASIN của variants
      for (const asin of variantAsins) {
        const variantRow = {};
        baseHeaders.forEach(header => {
          variantRow[header.toLowerCase().replace(/ /g, '_')] = '';
        });
        variantRow['asin'] = asin;
        
        // Thêm URL hình ảnh cho biến thể
        const variantImages = item.info?.hiResImages?.[asin] || [];
        for (let i = 0; i < maxImageCount; i++) {
          variantRow[`image_${i + 1}`] = variantImages[i] || '';
        }

        worksheet.addRow(variantRow);
      }
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const fileName = `amazon_scrape_multiple_${Math.floor(Date.now() / 1000)}.xlsx`;
    saveAs(blob, fileName);
  };

  // Thêm hàm parseVariants vào component
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

  // Thêm hàm này vào component
  function findUPCValue(info) {
    const detailFields = ['itemDetails', 'itemDetails2', 'technicalDetails', 'moreTechnicalDetails'];
    for (const field of detailFields) {
      if (info[field]) {
        if (typeof info[field] === 'string') {
          const upcMatch = info[field].match(/UPC\s*:?\s*(.*)/i);
          if (upcMatch) {
            return upcMatch[1];
          }
        } else if (typeof info[field] === 'object' && info[field] !== null) {
          // Nếu là object, tìm kiếm trong các thuộc tính
          for (const key in info[field]) {
            if (key.toLowerCase().includes('upc')) {
              return info[field][key];
            }
          }
        }
      }
    }
    return null;
  }

  function findBrandValue(info) {
    const detailFields = ['itemDetails', 'itemDetails2', 'technicalDetails', 'moreTechnicalDetails'];
    for (const field of detailFields) {
      if (info[field]) {
        if (typeof info[field] === 'string') {
          const brandMatch = info[field].match(/Brand\s*:?\s*(.*)/i);
          if (brandMatch) {
            return brandMatch[1];
          }
        } else if (typeof info[field] === 'object' && info[field] !== null) {
          // Nếu là object, tìm kiếm trong các thuộc tính
          for (const key in info[field]) {
            if (key.toLowerCase().includes('brand')) {
              return info[field][key];
            }
          }
        }
      }
    }
    return null;
  }

  function findManufacturerValue(info) {
    const detailFields = ['itemDetails', 'itemDetails2', 'technicalDetails', 'moreTechnicalDetails'];
    for (const field of detailFields) {
      if (info[field]) {
        if (typeof info[field] === 'string') {
          const manufacturerMatch = info[field].match(/Manufacturer\s*:?\s*(.*)/i);
          if (manufacturerMatch) {
            return manufacturerMatch[1];
          }
        } else if (typeof info[field] === 'object' && info[field] !== null) {
          // Nếu là object, tìm kiếm trong các thuộc tính
          for (const key in info[field]) {
            if (key.toLowerCase().includes('manufacturer')) {
              return info[field][key];
            }
          }
        }
      }
    }
    return null;
  }

  // Thêm hàm này vào component
  function cleanValue(value) {
    return value.replace(/^[\s:‏‎]+/, '').replace(/^&lrm;/, '').trim();
  }

  // Thêm hàm findWeightValue vào component
  const findWeightValue = (info) => {
    const searchWeight = (obj) => {
      if (typeof obj === 'string') {
        const lines = obj.split('\n');
        for (let line of lines) {
          if (line.toLowerCase().includes('weight')) {
            return line.split(':')[1].trim();
          }
        }
      } else if (typeof obj === 'object' && obj !== null) {
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
        const weightMatch = value.match(/(\d+(\.\d+)?)\s*(ounces|pounds|grams|kilograms|oz|lbs|g|kg)/i);
        if (weightMatch) {
          return weightMatch[0];
        }
      }
      return null;
    };

    // Tìm trọng lượng trong các trường chi tiết
    const detailFields = ['itemDetails', 'itemDetails2', 'technicalDetails', 'moreTechnicalDetails'];
    for (const field of detailFields) {
      if (info[field]) {
        let weight = searchWeight(info[field]);
        if (weight) {
          weight = extractWeight(weight);
          if (weight) return weight;
        }
      }
    }

    // Tìm trọng lượng trong trường weight riêng biệt
    if (info.weight) {
      const weight = extractWeight(info.weight);
      if (weight) return weight;
    }

    return 'Không tìm thấy thông tin về trọng lượng';
  };

  // Thêm hàm extractDimensions vào component (nếu chưa có)
  const extractDimensions = (itemDetails2, technicalDetails, info) => {
    const searchDimensions = (obj) => {
      if (typeof obj === 'string') {
        const lines = obj.split('\n');
        for (let line of lines) {
          if (line.toLowerCase().includes('dimensions') || line.toLowerCase().includes('package dimensions')) {
            return line.split(':')[1].trim();
          }
        }
      } else if (typeof obj === 'object' && obj !== null) {
        for (let key in obj) {
          if (key.toLowerCase().includes('dimensions') || key.toLowerCase().includes('package dimensions')) {
            return obj[key];
          }
        }
      }
      return null;
    };

    const dimensions = searchDimensions(itemDetails2) || searchDimensions(technicalDetails);
    let length = '', width = '', height = '', weight = '';

    if (dimensions) {
      const match = dimensions.match(/(\d+(\.\d+)?)\s*x\s*(\d+(\.\d+)?)\s*x\s*(\d+(\.\d+)?)/);
      const weightMatch = dimensions.match(/(\d+(\.\d+)?)\s*(ounces|pounds|grams|kilograms|oz|lbs|g|kg)/i);
      
      length = match ? match[1] : '';
      width = match ? match[3] : '';
      height = match ? match[5] : '';
      weight = weightMatch ? weightMatch[0] : '';
    }

    // Sử dụng hàm findWeightValue để tìm trọng lượng nếu chưa tìm thấy
    if (!weight) {
      weight = findWeightValue(info);
    }

    return { length, width, height, weight };
  };


  const findItemFormValue = (info) => {
    const detailFields = ['itemDetails', 'itemDetails2', 'technicalDetails', 'moreTechnicalDetails'];
    for (const field of detailFields) {
      if (info[field]) {
        if (typeof info[field] === 'string') {
          const itemFormMatch = info[field].match(/Item Form\s*:?\s*(.*)/i);
          if (itemFormMatch) {
            return itemFormMatch[1];
          }
        } else if (typeof info[field] === 'object' && info[field] !== null) {
          // Nếu là object, tìm kiếm trong các thuộc tính
          for (const key in info[field]) {
            if (key.toLowerCase().includes('item form')) {
              return info[field][key];
            }
          }
        }
      }
    }
    return null;
  };

  const findProductBenefitsValue = (info) => {
    const detailFields = ['itemDetails', 'itemDetails2', 'technicalDetails', 'moreTechnicalDetails'];
    for (const field of detailFields) {
      if (info[field]) {
        if (typeof info[field] === 'string') {
          const productBenefitsMatch = info[field].match(/Product Benefits\s*:?\s*(.*)/i);
          if (productBenefitsMatch) {
            return productBenefitsMatch[1];
          } 
        } else if (typeof info[field] === 'object' && info[field] !== null) {
          // Nếu là object, tìm kiếm trong các thuộc tính
          for (const key in info[field]) {
            if (key.toLowerCase().includes('product benefits')) {
              return info[field][key];
            }
          }
        } 
      }
    }
    return null;
  };

  const findScentValue = (info) => {
    const detailFields = ['itemDetails', 'itemDetails2', 'technicalDetails', 'moreTechnicalDetails'];
    for (const field of detailFields) {
      if (info[field]) {
        if (typeof info[field] === 'string') {
          const scentMatch = info[field].match(/Scent\s*:?\s*(.*)/i);
          console.log('Scent: ',scentMatch);
          if (scentMatch) {
            return scentMatch[1];
          } 
        } else if (typeof info[field] === 'object' && info[field] !== null) {
          // Nếu là object, tìm kiếm trong các thuộc tính
          for (const key in info[field]) {
            if (key.toLowerCase().includes('scent')) {
              return info[field][key];
            }
          }
        } 
      }
    }
    return null;
  };

  const findMaterialValue = (info) => {
    const detailFields = ['itemDetails', 'itemDetails2', 'technicalDetails', 'moreTechnicalDetails'];
    for (const field of detailFields) {
      if (info[field]) {
        if (typeof info[field] === 'string') {
          const materialMatch = info[field].match(/Material\s*:?\s*(.*)/i);
          if (materialMatch) {
            return materialMatch[1];
          } 
        } else if (typeof info[field] === 'object' && info[field] !== null) {
          // Nếu là object, tìm kiếm trong các thuộc tính
          for (const key in info[field]) {
            if (key.toLowerCase().includes('material type')) {
              return info[field][key];
            }
          }
        }  
      }
    }
    return null;
  };
  const findSkinTypeValue = (info) => {
    const detailFields = ['itemDetails', 'itemDetails2', 'technicalDetails', 'moreTechnicalDetails'];
    for (const field of detailFields) {
      if (info[field]) {
        if (typeof info[field] === 'string') {
          const skinTypeMatch = info[field].match(/Skin Type\s*:?\s*(.*)/i);
          if (skinTypeMatch) {
            return skinTypeMatch[1];
          } 
        } else if (typeof info[field] === 'object' && info[field] !== null) {
          // Nếu là object, tìm kiếm trong các thuộc tính
          for (const key in info[field]) {
            if (key.toLowerCase().includes('skin type')) {
              return info[field][key];
            }
          }
        }   
      }
    }
    return null;
  };

  const findItemVolumeValue = (info) => {
    const detailFields = ['itemDetails', 'itemDetails2', 'technicalDetails', 'moreTechnicalDetails'];
    for (const field of detailFields) {
      if (info[field]) {
        if (typeof info[field] === 'string') {
          const itemVolumeMatch = info[field].match(/Item Volume\s*:?\s*(.*)/i);
          if (itemVolumeMatch) {
            return itemVolumeMatch[1];
          } 
        } else if (typeof info[field] === 'object' && info[field] !== null) {
          // Nếu là object, tìm kiếm trong các thuộc tính
          for (const key in info[field]) {
            if (key.toLowerCase().includes('item volume')) {
              return info[field][key];
            }
          }
        }  
      } 
    }
    return null;
  };

  const findAgeRangeValue = (info) => {
    const detailFields = ['itemDetails', 'itemDetails2', 'technicalDetails', 'moreTechnicalDetails'];
    for (const field of detailFields) {
      if (info[field]) {
        if (typeof info[field] === 'string') {
          const ageRangeMatch = info[field].match(/Age Range\s*:?\s*(.*)/i);
          if (ageRangeMatch) {
            return ageRangeMatch[1];
          }  
        } else if (typeof info[field] === 'object' && info[field] !== null) {
          // Nếu là object, tìm kiếm trong các thuộc tính
          for (const key in info[field]) {
            if (key.toLowerCase().includes('age range')) {
              return info[field][key];
            }
          }
        }  
      } 
    }
    return null;
  };

  const findSpecialFeaturesValue = (info) => {
    const detailFields = ['itemDetails', 'itemDetails2', 'technicalDetails', 'moreTechnicalDetails'];
    for (const field of detailFields) {
      if (info[field]) {
        if (typeof info[field] === 'string') {
          const specialFeaturesMatch = info[field].match(/Special Features\s*:?\s*(.*)/i);
          if (specialFeaturesMatch) {
            return specialFeaturesMatch[1]; 
          }  
        } else if (typeof info[field] === 'object' && info[field] !== null) {
          // Nếu là object, tìm kiếm trong các thuộc tính
          for (const key in info[field]) {
            if (key.toLowerCase().includes('special feature')) {
              return info[field][key];
            }
          } 
        }  
      } 
    }
    return null;
  };

  const findPublisherValue = (info) => {
    const detailFields = ['itemDetails', 'itemDetails2', 'technicalDetails', 'moreTechnicalDetails'];
    for (const field of detailFields) {
      if (info[field]) {
        if (typeof info[field] === 'string') {
          const publisherMatch = info[field].match(/Publisher\s*:?\s*(.*)/i);
          if (publisherMatch) {
            return publisherMatch[1];
          } 
        } else if (typeof info[field] === 'object' && info[field] !== null) {
          // Nếu là object, tìm kiếm trong các thuộc tính
          for (const key in info[field]) {
            if (key.toLowerCase().includes('publisher')) {
              return info[field][key];
            }
          }
        }   
      } 
    }
    return null;
  };

  const findLanguageValue = (info) => {
    const detailFields = ['itemDetails', 'itemDetails2', 'technicalDetails', 'moreTechnicalDetails'];
    for (const field of detailFields) {
      if (info[field]) {
        if (typeof info[field] === 'string') {
          const languageMatch = info[field].match(/Language\s*:?\s*(.*)/i);
          if (languageMatch) {
            return languageMatch[1];  
          } 
        } else if (typeof info[field] === 'object' && info[field] !== null) {
          // Nếu là object, tìm kiếm trong các thuộc tính
          for (const key in info[field]) {
            if (key.toLowerCase().includes('language')) {
              return info[field][key];
            }
          } 
        }  
      } 
    }
    return null;
  };

  const findPaperbackValue = (info) => {
    const detailFields = ['itemDetails', 'itemDetails2', 'technicalDetails', 'moreTechnicalDetails'];
    for (const field of detailFields) {
      if (info[field]) {
        if (typeof info[field] === 'string') {
          const paperbackMatch = info[field].match(/Paperback\s*:?\s*(.*)/i);
          if (paperbackMatch) {
            return paperbackMatch[1]; 
          } 
        } else if (typeof info[field] === 'object' && info[field] !== null) {
          // Nếu là object, tìm kiếm trong các thuộc tính
          for (const key in info[field]) {
            if (key.toLowerCase().includes('paperback')) {
              return info[field][key];
            }
          }  
        }  
      } 
    }
    return null;
  };

  const findHardcoverValue = (info) => {
    const detailFields = ['itemDetails', 'itemDetails2', 'technicalDetails', 'moreTechnicalDetails'];
    for (const field of detailFields) {
      if (info[field]) {
        if (typeof info[field] === 'string') {
          const hardcoverMatch = info[field].match(/Hardcover\s*:?\s*(.*)/i);
          if (hardcoverMatch) {
            return hardcoverMatch[1]; 
          } 
        } else if (typeof info[field] === 'object' && info[field] !== null) {
          // Nếu là object, tìm kiếm trong các thuộc tính
          for (const key in info[field]) {
            if (key.toLowerCase().includes('hardcover')) {
              return info[field][key];
            }
          } 
        }  
      } 
    }   
    return null;
  };

  const findISBN10Value = (info) => {
    const detailFields = ['itemDetails', 'itemDetails2', 'technicalDetails', 'moreTechnicalDetails'];
    for (const field of detailFields) {
      if (info[field]) {
        if (typeof info[field] === 'string') {
          const isbn10Match = info[field].match(/ISBN-10\s*:?\s*(.*)/i);  
          if (isbn10Match) {
            return isbn10Match[1]; 
          } 
        } else if (typeof info[field] === 'object' && info[field] !== null) {
          // Nếu là object, tìm kiếm trong các thuộc tính
          for (const key in info[field]) {
            if (key.toLowerCase().includes('isbn-10')) {
              return info[field][key];  
            }
          } 
        }  
      } 
    }
    return null;
  };  

  const findISBN13Value = (info) => {
    const detailFields = ['itemDetails', 'itemDetails2', 'technicalDetails', 'moreTechnicalDetails'];
    for (const field of detailFields) {
      if (info[field]) {
        if (typeof info[field] === 'string') {
          const isbn13Match = info[field].match(/ISBN-13\s*:?\s*(.*)/i);
          if (isbn13Match) {
            return isbn13Match[1]; 
          } 
        } else if (typeof info[field] === 'object' && info[field] !== null) {
          // Nếu là object, tìm kiếm trong các thuộc tính
          for (const key in info[field]) {
            if (key.toLowerCase().includes('isbn-13')) {
              return info[field][key];  
            }
          } 
        }   
      } 
    }
    return null;
  };

  return (
    <div className="container">
      <h2>Amazon Scraper - Multiple ASINs/URLs</h2>
      
      <div className="input-container">
        <label htmlFor="api-key-input">API Key:</label>
        <input
          type="text"
          id="api-key-input"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Nhập API Key"
        />
      </div>

      <div className="input-container">
        <label htmlFor="thread-count">Luồng:</label>
        <input
          type="number"
          id="thread-count"
          value={threadCount}
          onChange={handleThreadCountChange}
          min="1"
        />
      </div>

      <div className="input-container">
        <label htmlFor="asin-input">Danh sách ASIN hoặc URL sản phẩm Amazon:</label>
        <textarea
          id="asin-input"
          value={asinInput}
          onChange={handleInputChange}
          placeholder="Nhập danh sách ASIN hoặc URL sản phẩm Amazon, mỗi ASIN/URL trên một dòng hoặc cách nhau bằng dấu phẩy"
          rows={5}
        />
      </div>

      <div className="action-buttons">
        <button onClick={handleStart} disabled={isProcessing}>
          Bắt Đầu
        </button>
        <button onClick={handleStop} disabled={!isProcessing}>
          Dừng
        </button>
        <button onClick={handleDownload} disabled={scrapedData.length === 0}>
          Tải Kết Quả
        </button>
      </div>

      <div className="result-area">
        <h3>Trả Kết Quả</h3>
        <textarea value={result} readOnly className="result-textarea" />
      </div>
    </div>
  );
}

export default AmazonScraperTabMultiple;