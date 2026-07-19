'use client';

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

import { Modal } from '@/components/ui/Modal';
import { cx } from '@/components/ui/cx';
import styles from './ProductGallery.module.css';

export interface GalleryImage {
  id: string;
  url: string;
}

interface ProductGalleryProps {
  images: GalleryImage[];
  productName: string;
}

/** Hero image + thumbnail strip; clicking either opens a carousel modal
 * (shared `Modal`, externally controlled) to page through all of a
 * product's images. Renders a placeholder when there are none. */
export function ProductGallery({ images, productName }: ProductGalleryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  if (images.length === 0) {
    return <div className={styles.placeholder} aria-hidden />;
  }

  const openAt = (index: number) => {
    setActiveIndex(index);
    setIsOpen(true);
  };

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.heroButton} onClick={() => openAt(0)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[0]!.url} alt={productName} className={styles.heroImage} />
      </button>

      {images.length > 1 && (
        <ul className={styles.thumbList}>
          {images.map((img, i) => (
            <li key={img.id}>
              <button
                type="button"
                className={styles.thumbButton}
                onClick={() => openAt(i)}
                aria-label={`View image ${i + 1} of ${images.length}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" className={styles.thumbImage} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={isOpen}
        onOpenChange={setIsOpen}
        title={`${productName} (${activeIndex + 1}/${images.length})`}
        className={styles.carouselModal}
      >
        <ImageCarousel images={images} activeIndex={activeIndex} onIndexChange={setActiveIndex} />
      </Modal>
    </div>
  );
}

interface ImageCarouselProps {
  images: GalleryImage[];
  activeIndex: number;
  onIndexChange: Dispatch<SetStateAction<number>>;
}

function ImageCarousel({ images, activeIndex, onIndexChange }: ImageCarouselProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') onIndexChange((i) => (i - 1 + images.length) % images.length);
      if (e.key === 'ArrowRight') onIndexChange((i) => (i + 1) % images.length);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [images.length, onIndexChange]);

  return (
    <div className={styles.carousel}>
      <div className={styles.carouselMain}>
        {images.length > 1 && (
          <button
            type="button"
            className={styles.navButton}
            onClick={() => onIndexChange((i) => (i - 1 + images.length) % images.length)}
            aria-label="Previous image"
          >
            ‹
          </button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[activeIndex]!.url} alt="" className={styles.carouselImage} />
        {images.length > 1 && (
          <button
            type="button"
            className={styles.navButton}
            onClick={() => onIndexChange((i) => (i + 1) % images.length)}
            aria-label="Next image"
          >
            ›
          </button>
        )}
      </div>

      {images.length > 1 && (
        <div className={styles.dots}>
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              className={cx(styles.dot, i === activeIndex && styles.dotActive)}
              onClick={() => onIndexChange(i)}
              aria-label={`Go to image ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
