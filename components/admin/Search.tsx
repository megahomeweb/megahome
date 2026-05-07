"use client";
import React from 'react'
import { ShineBorder } from '@/components/ui/shine-border';

interface props {
  search: string;
  placeholder: string;
  handleSearchChange: (e: string) => void;
}

const Search = ({search, handleSearchChange, placeholder}: props) => {
  return (
    <div className="px-3 sm:px-4 py-2 sm:py-3">
      <ShineBorder
        color={["#9ca3af", "#d1d5db", "#6b7280"]}
        borderWidth={1}
        duration={20}
        borderRadius={12}
        className="!p-0"
      >
        <label className="flex flex-col min-w-0 h-10 sm:h-12 w-full">
          <div className="flex w-full flex-1 items-stretch rounded-xl h-full">
            <div
              className="text-brand-text flex border-none bg-brand-gray-100 items-center justify-center pl-3 sm:pl-4 rounded-l-xl border-r-0 shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="size-5 sm:size-6" fill="currentColor" viewBox="0 0 256 256">
                <path
                  d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z"
                ></path>
              </svg>
            </div>
            <input
              placeholder={placeholder}
              className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-xl text-black focus:outline-0 focus:ring-0 border-none bg-brand-gray-100 focus:border-none h-full placeholder:text-brand-text px-3 sm:px-4 rounded-l-none border-l-0 pl-2 text-sm sm:text-base font-normal leading-normal"
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
            />
          </div>
        </label>
      </ShineBorder>
    </div>
  )
}

export default Search
