import axios from 'axios';
import { load } from 'cheerio';
//import UserAgent from 'user-agents';

const SCRAPEOPS_API_KEY = 'b92c10ff-930c-4e11-a8ba-6e6f88fc2beb';

async function getAmazonProductInfo(asinOrUrl, niche, apiKey) {
  if (!asinOrUrl || typeof asinOrUrl !== 'string') {
    throw new Error('ASIN hoặc URL không hợp lệ');
  }

  if (!apiKey) {
    throw new Error('API key không được cung cấp');
  }


  let url;
  let asin;

  if (asinOrUrl.startsWith('http')) {
    // Nếu input là full link
    url = asinOrUrl;
    // Trích xuất ASIN từ URL
    const asinMatch = url.match(/\/dp\/([A-Z0-9]{10})/);
    if (asinMatch) {
      asin = asinMatch[1];
    } else {
      throw new Error('Không thể trích xuất ASIN từ URL');
    }
  } else {
    // Nếu input là ASIN
    asin = asinOrUrl;
    url = `https://www.amazon.com/dp/${asin}`;
  }
  
  //const userAgent = new UserAgent();
  //console.log(userAgent.toString());
  try {
    const response = await axios.get(`https://proxy.scrapeops.io/v1/`, {
      params: {
        'api_key': apiKey,
        'url': url,
        'country': 'us',
        //'auto_extract': 'amazon'
        //'render_js': 'true',
        
      },
      headers: {
        'User-Agent': await getFakeUserAgent() //userAgent.toString()//
      }
    });
    console.log('Auto Extract Data:', JSON.stringify(response.data, null, 2));

    const $ = load(response.data);
  
    
    // Thêm dòng này để lấy ASIN của ảnh chính
    const mainImageAsin = $('#imageBlock_feature_div').attr('data-csa-c-asin') || asin;
    
    let colorImages = {};
    let colorToAsin = {};
    let hiResImages = {};

    let rawScripts = $('script').map((i, el) => $(el).html()).get();
    let objScript = rawScripts.find(script => script.includes('var obj = jQuery.parseJSON('));
    if (objScript) {
      const match = objScript.match(/var obj = jQuery\.parseJSON\('(.+?)'\);/);
      if (match && match[1]) {
        try {
          const parsedObj = JSON.parse(match[1].replace(/\\'/g, "'"));
          colorImages = parsedObj.colorImages || {};
          colorToAsin = parsedObj.colorToAsin || {};

          // Trích xuất các liên kết hiRes và phân loại theo ASIN
          for (const [color, images] of Object.entries(colorImages)) {
            const colorAsin = colorToAsin[color]?.asin;
            if (colorAsin) {
              hiResImages[colorAsin] = images
                .map(img => img.hiRes)
                .filter(url => url && url.includes('https://m.media-amazon.com/images/I/'))
                .filter((url, index, self) => self.indexOf(url) === index); // Loại bỏ các URL trùng lặp
            }
          }
        } catch (error) {
          console.error('Lỗi khi parse JSON:', error);
        }
      }
    }

    // Lấy tiêu đề == chắc chắn có
    const title = $('#productTitle').text().trim();

    // Lấy giá
    const priceElement = $('#corePrice_feature_div .a-offscreen').first();
    const price = priceElement.text().trim();

    // Lấy thông tin giao hàng == chắc chắn có
    let primaryDeliveryInfo = '';
    let secondaryDeliveryInfo = '';
    let checkPrimeMember = '';

    const primaryDeliveryElement = $('#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE .a-text-bold');
    if (primaryDeliveryElement.length) {
      primaryDeliveryInfo = primaryDeliveryElement.first().text().trim();
    }

    const secondaryDeliveryElement = $('#mir-layout-DELIVERY_BLOCK-slot-SECONDARY_DELIVERY_MESSAGE_LARGE .a-text-bold');
    if (secondaryDeliveryElement.length) {
      secondaryDeliveryInfo = secondaryDeliveryElement.first().text().trim();
    }
    //kiểm tra prime member == có thể có
    const checkPrimeElement = $('span[style*="color:#0064F9"]');
    if (checkPrimeElement.length) {
      checkPrimeMember = checkPrimeElement.first().text().trim();
    }

    // Kiểm tra tình trạng còn hàng
    let stockStatus = '';
    const stockElement = $('#availabilityInsideBuyBox_feature_div #availability .a-size-medium.a-color-success');
    if (stockElement.length) {
      stockStatus = stockElement.first().text().trim();
    }

    // Lấy thông tin Ships from và Sold by
    const shipsFrom = $('.offer-display-feature-text.a-spacing-none').eq(0).find('span').text().trim();
    const soldBy = $('.offer-display-feature-text.a-spacing-none').eq(1).find('span').text().trim();

    // Lấy thông tin Ingredients == có thể thay đổi
    let ingredients1 = '';
    const nicIngredientsContent = $('#nic-ingredients-content');
    if (nicIngredientsContent.length) {
      ingredients1 = nicIngredientsContent.find('span').text().trim();
      console.log('Ingredients1:', ingredients1);
    } else {
      $('#important-information .a-section.content').each(function() {
        const spanText = $(this).find('span.a-text-bold').text().trim();
        const headingText = $(this).find('h1, h2, h3, h4, h5, h6').text().trim();
        
        if (spanText === 'Ingredients' || headingText === 'Ingredients') {
          ingredients1 = $(this).find('p').text().trim();
          if (!ingredients1) {
            // Nếu không tìm thấy trong thẻ p, tìm trong nội dung trực tiếp của phần tử
            ingredients1 = $(this).clone().children().remove().end().text().trim();
          }
          console.log('Ingredients1:', ingredients1);
          return false; // Thoát khỏi vòng lặp sau khi tìm thấy
        }
      });
    }


    //vị trí ingredients 2 bên dươi, chỉ để test cho bên trên
    // let ingredients2 = '';
    // $('#important-information .a-section.content').each(function() {
    //   const spanText = $(this).find('span.a-text-bold').text().trim();
    //   if (spanText === 'Ingredients') {
    //       ingredients2 = $(this).find('p').text().trim();
    //       return false; // Thoát khỏi vòng lặp sau khi tìm thấy
    //   }
    // });
    // console.log('Ingredients2:', ingredients2); // Kiểm tra giá trị

  // Đảm bảo trả về ingredients trong đối tượng kết quả



    

    // Cập nhật phần lấy About This Item (thực phẩm)
    let itemDetails = {}
    $('table.a-normal.a-spacing-micro').each((tableIndex, tableElement) => {
      $(tableElement).find('tr').each((rowIndex, rowElement) => {
        const key = $(rowElement).find('td.a-span3 span.a-text-bold').text().trim();
        const value = $(rowElement).find('td.a-span9 span.a-size-base').text().trim();
        if (key && value) {
          itemDetails[key] = value;
        }
      });
    });

    // Chuyển đổi itemDetails thành chuỗi định dạng
    const itemDetailsString = Object.entries(itemDetails)
      .map(([key, value]) => `${key}:${value}`)
      .join('\n');

    console.log('Item Details:', itemDetailsString); // Để kiểm tra kết quả

    // Lấy Description trong About This Item
    let description = '';
    $('#feature-bullets li').each((index, element) => {
      description += $(element).find('span').text().trim() + '\n';
    });

    // Thêm đoạn code này sau phần lấy description hiện tại
    let bookDescription = '';
    $('#bookDescription_feature_div .a-expander-content').each((index, element) => {
      bookDescription += $(element).text().trim() + '\n';
    });

    // Xử lý variants
    let variants = '';
    const variantTypes = [
      { id: 'variation_flavor_name', name: 'Flavor' },
      { id: 'variation_size_name', name: 'Size' },
      { id: 'variation_color_name', name: 'Color' },
      { id: 'variation_style_name', name: 'Style' }
    ];
    
    let hasVariants = false;
    let variantLabels = []; // Thêm mảng này để lưu trữ các label
    
    for (const variantType of variantTypes) {
      const variantDiv = $(`#${variantType.id}`);
      if (variantDiv.length > 0) {
        const variantInfoResult = getVariantInfo($, variantDiv, variantType.name);
        variants += variantInfoResult;
        hasVariants = true;
        
        // Trích xuất label từ kết quả variantInfo
        const labelMatch = variantInfoResult.match(/LABEL:(.*)/);
        if (labelMatch) {
          variantLabels.push(labelMatch[1]);
        }
      }
    }
    
    if (!hasVariants) {
      variants = 'Không có thông tin về flavor, size, color hoặc style variants';
    }

    // Thêm phần trích xuất URL hình ảnh hiRes
    let mainImages = [];
    const scripts = $('script').map((i, el) => $(el).html()).get();
    const imageBlockScript = scripts.find(script => script.includes('ImageBlockATF'));
    if (imageBlockScript) {
      const hiResMatches = imageBlockScript.match(/"hiRes":\s*"https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+\.jpg"/g);
      if (hiResMatches) {
        mainImages = hiResMatches.map(match => {
          const url = match.match(/"hiRes":\s*"(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+\.jpg)"/)[1];
          return url;
        });
      }
    }

    // Thông tin chung cho tất cả các ngách
    const commonInfo = {
      title,
      price,
      primaryDeliveryInfo,
      secondaryDeliveryInfo,
      checkPrimeMember,
      stockStatus,
      shipsFrom,
      soldBy,
      itemDetails: itemDetailsString,
      description,
      bookDescription,
      variants,
      mainImages,
      colorImages,
      colorToAsin,
      hiResImages,
      mainImageAsin,
      ingredients1: ingredients1,
      itemDetails2: getItemDetails2($),
      technicalDetails: getTechnicalDetails($)
    };

    // Thông tin đặc biệt cho từng ngách
    let nicheSpecificInfo = {};

    switch (niche) {
      case 'Grocery & Gourmet Food':
      case 'Beauty & Personal Care':
        nicheSpecificInfo = {
          // description2: getDescription2($), // đã comment
          ingredients1: ingredients1,
          //ingredients2: ingredients2,
          //importantInformation: getImportantInformation($), // không cần thiết, do đã lấy được ingredients2
          itemDetails2: getItemDetails2($)
        };
        break;
      case 'Office Products':
        nicheSpecificInfo = {
          technicalDetails: getTechnicalDetails($)
        };
        break;
      // ... các ngách khác ...
      default:
        nicheSpecificInfo = {};
    }

    // Thêm vào hàm getAmazonProductInfo
    const category = $('#wayfinding-breadcrumbs_feature_div .a-unordered-list li:first-child a').text().trim();
    const subCategory = $('#wayfinding-breadcrumbs_feature_div .a-unordered-list li:last-child a').text().trim();

    const moreTechnicalDetails = getMoreTechnicalDetails($);

    // Thêm category và subCategory vào đối tượng trả về
    return {
      asin,
      url,
      category,
      subCategory,
      title,
      price,
      primaryDeliveryInfo,
      secondaryDeliveryInfo,
      checkPrimeMember,
      stockStatus,
      shipsFrom,
      soldBy,
      itemDetails: itemDetailsString,
      description,
      bookDescription,
      variants,
      mainImages,
      colorImages,
      colorToAsin,
      hiResImages,
      mainImageAsin,
      ingredients1: ingredients1,
      itemDetails2: getItemDetails2($),
      technicalDetails: getTechnicalDetails($),
      variantLabels,
      moreTechnicalDetails,
    };
  } catch (error) {
    console.error('Lỗi khi scraping:', error);
    return {
      title: 'Có lỗi xảy ra khi lấy tiêu đề',
      price: 'Có lỗi xảy ra khi lấy giá',
      primaryDeliveryInfo: 'Có lỗi xảy ra khi lấy thông tin giao hàng chính',
      secondaryDeliveryInfo: 'Có lỗi xảy ra khi lấy thông tin giao hàng phụ',
      checkPrimeMember: 'Có lỗi xảy ra khi kiểm tra Prime Member',
      stockStatus: 'Có lỗi xảy ra khi lấy thông tin tình trạng hàng',
      shipsFrom: 'Có lỗi xảy ra khi lấy thông tin nơi gửi hàng',
      soldBy: 'Có lỗi xảy ra khi lấy thông tin người bán',
      ingredients1: 'Có lỗi xảy ra khi lấy thông tin thành phần',
      //ingredients2: 'Có lỗi xảy ra khi lấy thông tin thành phần',
      itemDetails: 'Có lỗi xảy ra khi lấy thông tin chi tiết sản phẩm',
      description: 'Có lỗi xảy ra khi lấy mô tả sản phẩm',
      //description2: 'Có lỗi xảy ra khi lấy mô tả sản phẩm',
      itemDetails2: 'Có lỗi xảy ra khi lấy thông tin chi tiết sản phẩm bổ sung',
      variants: 'Có lỗi xảy ra khi lấy thông tin về variants',
      mainImages: ['Có lỗi xảy ra khi lấy hình ảnh hiRes'],
      colorImages: 'Có lỗi xảy ra khi lấy thông tin hình ảnh màu sắc',
      colorToAsin: 'Có lỗi xảy ra khi lấy thông tin ASIN theo màu sắc',
      hiResImages: 'Có lỗi xảy ra khi lấy thông tin hình ảnh hiRes',
      mainImageAsin: 'Có lỗi xảy ra khi lấy ASIN của ảnh chính',
    };
  }
}

function getVariantInfo($, variantDiv, variantType) {
  let variantInfo = `Variants:==\n`;
  
  // Kiểm tra label và span
  const label = variantDiv.find('label.a-form-label').text().trim();
  const selection = variantDiv.find('span.selection').text().trim();
  if (label && selection) {
    variantInfo += `${label} ${selection}\n\n`;
  }
  
  // Thêm đoạn code mới để lưu trữ thông tin label và selection
  if (label && selection) {
    variantInfo += `LABEL:${label.replace(':', '')}\nSELECTION:${selection}\n\n`;
  }
  
  // Kiểm tra các <li> elements
  variantDiv.find('li').each((index, element) => {
    const value = $(element).attr('title')?.replace('Click to select ', '');
    const itemId = $(element).attr('data-csa-c-item-id');
    if (value && itemId) {
      variantInfo += `${variantType}: ${value}\nASIN: ${itemId}\n\n`;
    }
  });
  
  // Kiểm tra <select> element
  const select = variantDiv.find(`select[name="dropdown_selected_${variantType.toLowerCase()}_name"]`);
  if (select.length > 0) {
    select.find('option').each((index, element) => {
      const value = $(element).text().trim();
      const optionValue = $(element).attr('value');
      if (value && optionValue) {
        const asin = optionValue.split(',')[1];
        variantInfo += `${variantType}: ${value}\nASIN: ${asin}\n\n`;
      }
    });
  }
  
  return variantInfo;
}

async function getFakeUserAgent() {
  try {
    const response = await axios.get('https://headers.scrapeops.io/v1/browser-headers', { //browser-headers //user-agents
      params: {
        'api_key': SCRAPEOPS_API_KEY,
      }
    });
    console.log('Fake User Agent:', response.data.result[0]);
    return response.data.result[0];
  } catch (error) {
    console.error('Lỗi khi lấy fake user agent:', error);
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
  }
}

// Hàm helper để lấy description2
function getDescription2($) {
  return $('#productDescription span').text().trim() || 'Không có mô tả sản phẩm bổ sung';
}

// Hàm helper để lấy importantInformation
function getImportantInformation($) {
  const importantInfo = $('#important-information');
  const contentSections = importantInfo.find('.content');
  let importantInformation = '';

  contentSections.each((index, section) => {
    let heading = $(section).find('h1, h2, h3, h4, h5, h6').first().text().trim();
    
    // Nếu không tm thấy heading trong h1-h6, tìm kiếm các phần tử khác có thể là heading
    if (!heading) {
      heading = $(section).find('.a-text-bold').first().text().trim();
    }
    
    // Nếu vẫn không tìm thấy, có thể cần thêm các selector khác tùy thuộc vào cấu trúc HTML
    
    let content = '';
    const paragraphs = $(section).find('p');
    
    if (paragraphs.length) {
      content = paragraphs.map((i, el) => $(el).text().trim()).get().join('\n');
    } else {
      // Nếu không có thẻ p, lấy tất cả nội dung text của section
      content = $(section).clone().children().remove().end().text().trim();
    }
    
    if (heading && content) {
      importantInformation += `${heading}:\n${content}\n\n`;
    }
  });

  return importantInformation.trim() || 'Không có thông tin quan trọng';
}

// Hàm helper để lấy itemDetails2
function getItemDetails2($) {
  let itemDetails2 = '';
  const desiredFields = [
    'Package Dimensions',
    'Product Dimensions',
    'Item model number',
    'UPC',
    'Manufacturer',
    'ASIN',
    'Country of Origin',
    'Publisher',
    'Language',
    'Paperback',
    'Hardcover',
    'ISBN-10',
    'ISBN-13',
    'Dimensions',
    'Item Weight',
    'Weight'
  ];

  $('#detailBulletsWrapper_feature_div').find('ul.a-unordered-list, div.a-section').each((index, element) => {
    $(element).find('li, div').each((i, item) => {
      const text = $(item).text().trim().replace(/\s+/g, ' ');
      for (const field of desiredFields) {
        if (text.startsWith(field)) {
          const [key, ...valueParts] = text.split(':');
          const value = valueParts.join(':').trim();
          itemDetails2 += `${key.trim()} : ${value}\n`;
          break;
        }
      }
    });
  });

  return itemDetails2.trim() || 'Không có thông tin chi tiết sản phẩm bổ sung';
}


// Hàm helper để lấy thông tin chi tiết sản phẩm
function getTechnicalDetails($) {
  const details = {};
  $('#productDetails_feature_div table').each((index, table) => {
    $(table).find('tr').each((i, row) => {
      const key = $(row).find('th').text().trim();
      const value = $(row).find('td').text().trim();
      if (key && value) {
        details[key] = value;
      }
    });
  });
  return details;
}


function getMoreTechnicalDetails($) {
  console.log("Bắt đầu getMoreTechnicalDetails");
  console.log("HTML của toàn bộ trang:", $.html());
  const table = $('#productDetails_techSpec_section_1');
  console.log("Tìm thấy bảng:", table.length > 0);

  if (table.length === 0) {
    console.log("HTML của phần tử cha:", $('#productDetails_feature_div').html());
  }

  const details = {};
  table.find('tr').each((i, row) => {
    console.log("Đang xử lý hàng:", i);
    const key = $(row).find('th').text().trim();
    const value = $(row).find('td').text().trim();
    console.log("Key:", key, "Value:", value);
    if (key && value) {
      details[key] = value.replace(/^[\s‎]+/, '').replace(/^‎/, '');
    }
  });

  console.log("Kết quả cuối cùng từ getMoreTechnicalDetails:", details);
  return details;
}


// Xuất hàm mới này cùng với hàm getAmazonProductInfo
export { getAmazonProductInfo};